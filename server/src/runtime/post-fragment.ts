import { drizzle } from "drizzle-orm/d1";
import { getClientConfigWithDefaults } from "../services/config-helpers";
import { CacheImpl } from "../utils/cache";
import { reduceMarkdown } from "./post-markdown";
import { postSlugFromPath, resolvePublishedPost } from "./post-visibility";
import { escapeHtml } from "./seo-meta";

// Server-rendered body for a post route. Same posture as index-fragment.ts: a crawler
// pre-render spliced into <div id="root">, replaced by React on mount — not hydrated
// markup, not a reproduction of the client render. Served to every requester; nothing
// here reads a request header (a crawler-only fragment would be cloaking).

export interface PostFragmentInput {
  title?: string | null;
  content: string;
}

/** Pure markup builder — separated from data access so it can be tested directly. */
export function renderPostFragment(siteName: string, post: PostFragmentInput): string {
  const title = post.title?.trim();
  return (
    `<article data-ssr-post>` +
    (title ? `<h1>${escapeHtml(title)}</h1>` : "") +
    reduceMarkdown(post.content) +
    // Gives every post at least one crawlable link back into the site, including posts
    // whose bodies contain none.
    `<nav><a href="/">${escapeHtml(siteName)}</a></nav>` +
    `</article>`
  );
}

/**
 * Fragment for a post route; "" for anything that is not a published post.
 *
 * Visibility is decided entirely by resolvePublishedPost (post-visibility.ts) — the same
 * resolution the head injection uses. There is deliberately no draft/listed check here.
 */
export async function buildPostBodyInjection(request: Request, env: Env): Promise<string> {
  const pathname = new URL(request.url).pathname;

  // Not a post route: no DB access at all.
  if (!postSlugFromPath(pathname)) {
    return "";
  }

  const schema = await import("../db/schema");
  const db = drizzle(env.DB, { schema });

  const { post } = await resolvePublishedPost(db, schema, pathname);
  if (!post) {
    return "";
  }

  const clientConfig = new CacheImpl(db, env, "client.config", "database");
  const siteConfigData = await getClientConfigWithDefaults(clientConfig, env);
  const siteName = String(siteConfigData["site.name"] || "Rin");

  return renderPostFragment(siteName, post);
}
