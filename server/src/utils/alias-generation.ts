import { isNotNull } from "drizzle-orm";
import type { DB } from "../core/hono-types";
import { feeds } from "../db/schema";
import { slugify } from "./slugify";
import { isReservedAlias } from "./canonical";

const MAX_COLLISION_ATTEMPTS = 50;

/**
 * A title-derived alias, disambiguated against existing rows, or `null` if the title
 * yields nothing usable (empty after slugifying) or lands on a reserved name — in
 * either case the caller should fall back to the existing no-alias canonical
 * behaviour (`/${id}`) rather than store a bad value.
 *
 * `excludeId` lets an update check for collisions without matching its own row.
 *
 * Collision matching is done in JS against every stored alias, not a
 * `LIKE '<slug>%'` query: Cloudflare D1 rejects a LIKE pattern once the literal
 * prefix passes ~50 characters ("LIKE or GLOB pattern too complex", SQLITE_ERROR
 * 7500) — a limit local bun:sqlite does not enforce, so it passed every local test
 * and only surfaced against production. A slug can be up to 60 chars (slugify's own
 * cap), so it could always exceed that threshold. Fetching all aliases avoids the
 * limit entirely and is cheap at this blog's scale (tens to low hundreds of posts).
 */
export async function generateUniqueAlias(
  db: DB,
  title: string,
  options: { excludeId?: number } = {},
): Promise<string | null> {
  const base = slugify(title);
  if (!base || isReservedAlias(base)) {
    return null;
  }

  const existing = await db.query.feeds.findMany({
    where: isNotNull(feeds.alias),
    columns: { id: true, alias: true },
  });

  const taken = new Set(
    existing
      .filter((row) => row.id !== options.excludeId)
      .map((row) => row.alias)
      .filter((alias): alias is string => Boolean(alias)),
  );

  if (!taken.has(base)) {
    return base;
  }

  for (let n = 2; n <= MAX_COLLISION_ATTEMPTS; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  // Extremely unlikely on a real blog (50 titles all slugifying to the same base) —
  // better to fall back to the id-based URL than to loop unbounded or throw.
  return null;
}

/**
 * The alias to store on save, in the precedence design.md's Addendum 2 lays out:
 * an author-supplied alias always wins; failing that, an existing stored alias is
 * never silently discarded by a save that omits it; only when neither is present is
 * one generated from the title.
 *
 * `generate` is injected (rather than calling generateUniqueAlias directly) so this
 * precedence logic is testable without a database.
 */
export async function resolveAliasForSave(
  existingAlias: string | null | undefined,
  incomingAlias: string | null | undefined,
  title: string,
  generate: (title: string) => Promise<string | null>,
): Promise<string | null> {
  const incoming = incomingAlias?.trim();
  if (incoming) {
    return incoming;
  }

  const existing = existingAlias?.trim();
  if (existing) {
    return existing;
  }

  return generate(title);
}
