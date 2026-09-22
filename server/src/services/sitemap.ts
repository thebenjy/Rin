import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext } from "../core/hono-types";
import { feeds } from "../db/schema";
import { canonicalUrlForPost } from "../utils/canonical";

// Only the index. /timeline, /moments, /hashtags and /friends are Rin engine
// furniture, not content — they are served noindex (see seo-meta.ts) and must not
// be advertised here, or the sitemap tells Google to index what the pages refuse.
const STATIC_PATHS = ["/"];

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function urlEntry(loc: string, lastmod?: Date) {
  const lastmodTag = lastmod ? `<lastmod>${lastmod.toISOString()}</lastmod>` : "";
  return `<url><loc>${escapeXml(loc)}</loc>${lastmodTag}</url>`;
}

export function SitemapService(): Hono {
  const app = new Hono();

  app.get("/sitemap.xml", async (c: AppContext) => {
    const db = c.get("db");
    const origin = new URL(c.req.url).origin;

    const posts = await db.query.feeds.findMany({
      where: and(eq(feeds.draft, 0), eq(feeds.listed, 1)),
      columns: { id: true, alias: true, updatedAt: true },
      orderBy: [desc(feeds.updatedAt)],
    });

    const urls = [
      ...STATIC_PATHS.map((path) => urlEntry(`${origin}${path}`)),
      ...posts.map((post) => urlEntry(canonicalUrlForPost(origin, post), post.updatedAt)),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;

    return c.text(xml, 200, {
      "Content-Type": "application/xml; charset=UTF-8",
      "Cache-Control": "public, max-age=3600",
    });
  });

  return app;
}
