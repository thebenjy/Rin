// Client-side mirror of server/src/utils/canonical.ts.
//
// GA4 page reports must use the same path the canonical tag and the sitemap use, or
// a single post shows up as two rows and the analytics split survives the SEO fix.
//
// `/feed/:id` is the engine's internal route; `/:id` (or `/:alias`) is the public
// form. Normalising here keeps reporting aligned with the canonical.
//
// Known limitation: for a post that HAS an alias but was reached via /feed/<id>, this
// yields /<id> rather than /<alias>. That combination only occurs on legacy links —
// the app itself links to the canonical form — and disappears once aliases are
// backfilled and /feed/ links stop being shared.
export function canonicalPagePath(pathname: string): string {
  const feedMatch = /^\/feed\/([^/]+)\/?$/.exec(pathname);
  if (feedMatch) {
    return `/${feedMatch[1]}`;
  }
  // Drop a trailing slash except on the root.
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}
