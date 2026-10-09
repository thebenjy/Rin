import type { DrizzleD1Database } from "drizzle-orm/d1";
import { renderPostFragment } from "../runtime/post-fragment";
import { resolvePublishedPost } from "../runtime/post-visibility";
import { canonicalUrlForPost } from "../utils/canonical";

// Report, not a gate: how many links each published post's own prose carries. The
// engine cannot and must not write links into an author's text, so the absence of links
// is a content state to surface, never an error. Nothing here throws on a zero count.

type Schema = typeof import("../db/schema");

/** Hub pages on the apex (not the blog) that a post could link to. */
export const HUB_PAGES = [
  "/family",
  "/low-appetite-meals/",
  "/high-protein-small-meals/",
  "/gentle-meals-for-side-effects/",
  "/fatigue-meals/",
  "/meal-plan/",
] as const;

export interface PostLinkRow {
  url: string;
  bodyAnchors: number;
}

export interface LinkReport {
  posts: PostLinkRow[];
  published: number;
  /** Posts with at least one body anchor. Always present, including when it is 0. */
  withBodyAnchors: number;
}

/**
 * Anchors in the rendered fragment that came from the article, i.e. excluding the
 * <nav> breadcrumb renderPostFragment adds so every post has at least one link.
 */
export function countBodyAnchors(fragment: string): number {
  const withoutNav = fragment.replace(/<nav>[\s\S]*?<\/nav>/g, "");
  return (withoutNav.match(/<a\s/g) ?? []).length;
}

/**
 * One row per published, listed post. Visibility comes only from resolvePublishedPost —
 * the same resolution the head and body injections use — by resolving every post id
 * and keeping what it returns. Drafts and unlisted posts resolve to null and drop out.
 */
export async function buildLinkReport(
  db: DrizzleD1Database<Schema>,
  schema: Schema,
  origin: string,
): Promise<LinkReport> {
  const ids = await db.select({ id: schema.feeds.id }).from(schema.feeds).orderBy(schema.feeds.id);

  const posts: PostLinkRow[] = [];
  for (const { id } of ids) {
    const { post } = await resolvePublishedPost(db, schema, `/feed/${id}`);
    if (!post) continue;
    posts.push({
      url: canonicalUrlForPost(origin, post),
      bodyAnchors: countBodyAnchors(renderPostFragment("", post)),
    });
  }

  return {
    posts,
    published: posts.length,
    withBodyAnchors: posts.filter((p) => p.bodyAnchors > 0).length,
  };
}

export function formatLinkReport(report: LinkReport, apexOrigin: string): string {
  const lines = [
    `Posts with at least one body link: ${report.withBodyAnchors} of ${report.published}`,
    "",
    ...report.posts.map((p) => `${String(p.bodyAnchors).padStart(4)}  ${p.url}`),
  ];
  if (report.posts.some((p) => p.bodyAnchors === 0)) {
    lines.push("", "Posts with 0 have no links in their prose. Hub pages they could link to:");
    for (const hub of HUB_PAGES) lines.push(`  ${apexOrigin}${hub}`);
  }
  return lines.join("\n");
}
