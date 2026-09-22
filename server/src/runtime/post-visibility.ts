import { drizzle } from "drizzle-orm/d1";
import { eq, or } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import createJWT from "../utils/jwt";

// Draft and unlisted posts are correctly kept out of the sitemap and correctly served
// `noindex, nofollow`, so they are not a search problem. They ARE readable by anyone
// who guesses the id — unreleased writing is public before the author publishes it.
// This resolves whether a request targets unpublished content, and whether the caller
// is staff, so the fetch handler can answer 404 to everyone else.

// Mirrors the route shapes seo-meta.ts recognises: these never identify a post.
const NON_POST_PREFIXES = ["/admin", "/callback", "/login", "/profile", "/user"];
const NON_POST_EXACT = new Set(["/", "/timeline", "/moments", "/friends", "/hashtags"]);

export interface PostVisibility {
  /** The path addresses a specific post (whether or not it exists). */
  isPostRoute: boolean;
  /** A post row was found for this path. */
  found: boolean;
  /** The post is published: not a draft, and listed. */
  published: boolean;
}

function postSlugFromPath(pathname: string): string | null {
  if (NON_POST_EXACT.has(pathname)) return null;
  if (NON_POST_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  if (pathname.startsWith("/hashtag/") || pathname.startsWith("/search/")) return null;

  const feedMatch = /^\/feed\/([^/]+)$/.exec(pathname);
  if (feedMatch) return feedMatch[1];

  const aliasMatch = /^\/([^/]+)$/.exec(pathname);
  return aliasMatch ? aliasMatch[1] : null;
}

/**
 * True when the request carries a valid signed session token.
 *
 * Deliberately does NOT re-query the users table: the signature proves the token was
 * issued by this server, which is enough to decide "show the draft". Authorisation for
 * anything that mutates state still runs through the Hono auth middleware.
 */
export async function hasValidSession(request: Request, env: Env): Promise<boolean> {
  const secret = env.JWT_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  let token: string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else {
    // getCookie accepts anything exposing req.raw.headers.
    token = getCookie({ req: { raw: request } } as never, "token");
  }
  if (!token) return false;

  try {
    return Boolean(await createJWT(secret).verify(token));
  } catch {
    return false;
  }
}

export async function resolvePostVisibility(request: Request, env: Env): Promise<PostVisibility> {
  const slug = postSlugFromPath(new URL(request.url).pathname);
  if (!slug) {
    return { isPostRoute: false, found: false, published: false };
  }

  const schema = await import("../db/schema");
  const db = drizzle(env.DB, { schema });
  const idNum = Number.parseInt(slug, 10);

  const post = await db.query.feeds.findFirst({
    where: or(eq(schema.feeds.id, idNum), eq(schema.feeds.alias, slug)),
    columns: { id: true, draft: true, listed: true },
  });

  if (!post) {
    return { isPostRoute: true, found: false, published: false };
  }

  return {
    isPostRoute: true,
    found: true,
    published: !post.draft && Boolean(post.listed),
  };
}

/**
 * Serve 404 for a post URL that has no publicly-visible content behind it — either a
 * post that exists but is draft/unlisted, or an id/alias with no row at all — unless
 * the caller is staff (who may be previewing a draft; there is nothing to preview for
 * a nonexistent id, but the check is harmless and keeps the rule uniform).
 *
 * Checked against production data (2026-09-22): the blog has never actually had a
 * draft or unlisted row — every post is published. The ids this was written to guard
 * (7, 8, 12) turned out to be gaps with no row at all, not hidden drafts. Handling
 * "not found" here as well as "found but unpublished" is what actually fixes them.
 */
export async function shouldHideUnpublishedPost(request: Request, env: Env): Promise<boolean> {
  const visibility = await resolvePostVisibility(request, env);
  if (!visibility.isPostRoute || visibility.published) {
    return false;
  }
  return !(await hasValidSession(request, env));
}
