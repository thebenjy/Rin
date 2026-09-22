// Single source of truth for a post's public URL.
//
// This used to be duplicated: seo-meta.ts emitted `/feed/${id}` when a post had no
// alias, while sitemap.ts emitted `/${id}`. Every post without an alias therefore
// declared a canonical the sitemap contradicted, and Google indexed neither form.
// Both modules now call through here so the two cannot disagree again.

export interface CanonicalPostRef {
  id: number;
  alias?: string | null;
}

// Route names an alias must never equal — they'd make a post unreachable (shadowed by
// the engine route of the same name) or ambiguous with an id lookup. Previously
// duplicated between post-visibility.ts's NON_POST_PREFIXES/NON_POST_EXACT and the
// authoring guide's own "never use these words" list; centralised here since this is
// the module that owns what a post's URL is allowed to be.
export const RESERVED_ALIASES: ReadonlySet<string> = new Set([
  "timeline",
  "moments",
  "friends",
  "hashtags",
  "login",
  "profile",
  "search",
  "feed",
  "admin",
  "callback",
  "user",
]);

/** True for a value that would collide with an engine route or a raw id lookup. */
export function isReservedAlias(value: string): boolean {
  return RESERVED_ALIASES.has(value) || /^\d+$/.test(value);
}

/** Public path for a post: its alias when set, otherwise its id. Always leading-slash. */
export function canonicalPathForPost(post: CanonicalPostRef): string {
  const alias = post.alias?.trim();
  return `/${alias || post.id}`;
}

/** Absolute public URL for a post, for `rel=canonical`, OG tags and the sitemap. */
export function canonicalUrlForPost(origin: string, post: CanonicalPostRef): string {
  return `${origin}${canonicalPathForPost(post)}`;
}
