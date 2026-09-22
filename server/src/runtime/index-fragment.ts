import { drizzle } from "drizzle-orm/d1";
import { and, desc, eq } from "drizzle-orm";
import { getClientConfigWithDefaults } from "../services/config-helpers";
import { CacheImpl } from "../utils/cache";
import { canonicalPathForPost } from "../utils/canonical";

// The blog index is client-rendered, so the HTML a crawler receives for "/" is an
// empty shell: no <title>, no <h1>, and zero <a href>. Posts were therefore only
// discoverable via sitemap.xml — the weakest available signal, and one that was itself
// contradicted by the canonical tags (see utils/canonical.ts).
//
// This emits a server-rendered fragment spliced into <div id="root"> so a crawler that
// does not execute JS still finds a heading and a link to every published post. It is a
// pre-render placeholder, NOT hydrated markup: the client mounts with
// createRoot(...).render(...), which discards existing container children. Using
// hydrateRoot instead would mismatch — see design.md D-3.

const MAX_LINKS = 500;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface IndexFragmentPost {
  id: number;
  alias?: string | null;
  title?: string | null;
}

/** Pure markup builder — separated from data access so it can be tested directly. */
export function renderIndexFragment(siteName: string, posts: IndexFragmentPost[]): string {
  const links = posts
    .map((post) => {
      const href = canonicalPathForPost(post);
      const label = post.title?.trim() || href.replace(/^\//, "");
      return `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`;
    })
    .join("");

  return (
    `<div data-ssr-index>` +
    `<h1>${escapeHtml(siteName)}</h1>` +
    `<ul>${links}</ul>` +
    `</div>`
  );
}

/** Fragment for the index route; "" for every other path. */
export async function buildIndexBodyInjection(request: Request, env: Env): Promise<string> {
  if (new URL(request.url).pathname !== "/") {
    return "";
  }

  const schema = await import("../db/schema");
  const db = drizzle(env.DB, { schema });

  const clientConfig = new CacheImpl(db, env, "client.config", "database");
  const siteConfigData = await getClientConfigWithDefaults(clientConfig, env);
  const siteName = String(siteConfigData["site.name"] || "Rin");

  // Same filter the sitemap uses, so the crawl graph and the sitemap cannot disagree.
  const posts = await db.query.feeds.findMany({
    where: and(eq(schema.feeds.draft, 0), eq(schema.feeds.listed, 1)),
    columns: { id: true, alias: true, title: true },
    orderBy: [desc(schema.feeds.updatedAt)],
    limit: MAX_LINKS,
  });

  return renderIndexFragment(siteName, posts);
}
