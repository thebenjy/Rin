import { drizzle } from "drizzle-orm/d1";
import { eq, or } from "drizzle-orm";
import { getClientConfigWithDefaults } from "../services/config-helpers";
import { CacheImpl } from "../utils/cache";
import { extractImage } from "../utils/image";

const STATIC_ROUTE_TITLES: Record<string, string> = {
  "/timeline": "Timeline",
  "/moments": "Moments",
  "/friends": "Friends",
  "/hashtags": "Hashtags",
};

const SKIPPED_PREFIXES = ["/admin", "/callback", "/login", "/profile", "/user"];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonLdScript(payload: unknown): string {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

// Strip common markdown syntax to build a short plain-text excerpt when a post has no
// author-supplied summary. Not a full markdown parser — just enough to avoid dumping
// raw syntax (`![alt](url)`, `**bold**`, `# heading`) into a meta description.
function excerptFromMarkdown(markdown: string, maxLen = 155): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/[*_~`>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLen) {
    return text;
  }

  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trim()}…`;
}

function baseTags(opts: {
  title: string;
  description: string;
  image?: string;
  url: string;
  siteName: string;
  type: "website" | "article";
  robots?: string;
}): string {
  const { title, description, image, url, siteName, type, robots = "index, follow" } = opts;
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta name="robots" content="${robots}">`,
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    `<meta property="og:site_name" content="${escapeHtml(siteName)}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
  ];

  if (image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(image)}">`);
    tags.push(`<meta name="twitter:image" content="${escapeHtml(image)}">`);
  }

  return tags.join("");
}

// Builds the <head> markup to splice into the SPA shell before returning it, so
// crawlers that don't execute JS (social link-preview bots, some search engines) see
// real title/description/canonical/OG/Twitter/JSON-LD instead of the bare shell that
// react-helmet only fills in client-side after hydration.
export async function buildHeadInjection(request: Request, env: Env): Promise<string> {
  const url = new URL(request.url);
  const origin = url.origin;
  const pathname = url.pathname;

  if (SKIPPED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return "";
  }

  const schema = await import("../db/schema");
  const db = drizzle(env.DB, { schema });
  const clientConfig = new CacheImpl(db, env, "client.config", "database");
  const siteConfigData = await getClientConfigWithDefaults(clientConfig, env);
  const siteName = String(siteConfigData["site.name"] || "Rin");
  const siteDescription = String(siteConfigData["site.description"] || "");
  const siteAvatar = siteConfigData["site.avatar"] ? String(siteConfigData["site.avatar"]) : undefined;

  const isKnownListPage =
    pathname === "/" ||
    pathname in STATIC_ROUTE_TITLES ||
    pathname.startsWith("/hashtag/") ||
    pathname.startsWith("/search/");

  if (isKnownListPage) {
    const label =
      pathname === "/"
        ? undefined
        : (STATIC_ROUTE_TITLES[pathname] ??
          (pathname.startsWith("/hashtag/") ? decodeURIComponent(pathname.split("/")[2] || "") : "Search"));
    const title = label ? `${label} - ${siteName}` : siteName;

    const head = baseTags({
      title,
      description: siteDescription,
      image: siteAvatar,
      url: `${origin}${pathname}`,
      siteName,
      type: "website",
    });

    if (pathname !== "/") {
      return head;
    }

    const jsonLd =
      jsonLdScript({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: siteName,
        url: origin,
        description: siteDescription,
      }) +
      jsonLdScript({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: siteName,
        url: origin,
        ...(siteAvatar ? { logo: siteAvatar } : {}),
      });

    return head + jsonLd;
  }

  const feedMatch = /^\/feed\/([^/]+)$/.exec(pathname);
  const aliasMatch = feedMatch ? null : /^\/([^/]+)$/.exec(pathname);
  const slug = feedMatch?.[1] ?? aliasMatch?.[1];

  if (!slug) {
    return "";
  }

  const idNum = Number.parseInt(slug, 10);
  const post = await db.query.feeds.findFirst({
    where: or(eq(schema.feeds.id, idNum), eq(schema.feeds.alias, slug)),
    with: {
      hashtags: { columns: {}, with: { hashtag: { columns: { id: true, name: true } } } },
      user: { columns: { id: true, username: true, avatar: true } },
    },
  });

  if (!post || post.draft || !post.listed) {
    return baseTags({
      title: siteName,
      description: siteDescription,
      image: siteAvatar,
      url: `${origin}${pathname}`,
      siteName,
      type: "website",
      robots: "noindex, nofollow",
    });
  }

  const canonicalUrl = `${origin}${post.alias ? `/${post.alias}` : `/feed/${post.id}`}`;
  const title = post.title ? `${post.title} - ${siteName}` : siteName;
  const description = post.summary.trim() || (post.content ? excerptFromMarkdown(post.content) : siteDescription);
  const image = extractImage(post.content) || siteAvatar;
  const hashtags = post.hashtags.map((entry) => entry.hashtag.name);
  const publishedTime = post.createdAt.toISOString();
  const modifiedTime = post.updatedAt.toISOString();

  const head = baseTags({
    title,
    description,
    image,
    url: canonicalUrl,
    siteName,
    type: "article",
  });

  const articleMeta = [
    `<meta property="article:published_time" content="${escapeHtml(publishedTime)}">`,
    `<meta property="article:modified_time" content="${escapeHtml(modifiedTime)}">`,
    post.user?.username ? `<meta name="author" content="${escapeHtml(post.user.username)}">` : "",
    hashtags.length > 0 ? `<meta name="keywords" content="${escapeHtml(hashtags.join(", "))}">` : "",
    ...hashtags.map((tag) => `<meta property="article:tag" content="${escapeHtml(tag)}">`),
  ].join("");

  const jsonLd =
    jsonLdScript({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description,
      ...(image ? { image } : {}),
      datePublished: publishedTime,
      dateModified: modifiedTime,
      author: { "@type": "Organization", name: siteName },
      mainEntityOfPage: canonicalUrl,
    }) +
    jsonLdScript({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: origin },
        { "@type": "ListItem", position: 2, name: post.title || siteName, item: canonicalUrl },
      ],
    });

  return head + articleMeta + jsonLd;
}
