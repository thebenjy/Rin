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

/** Public path for a post: its alias when set, otherwise its id. Always leading-slash. */
export function canonicalPathForPost(post: CanonicalPostRef): string {
  const alias = post.alias?.trim();
  return `/${alias || post.id}`;
}

/** Absolute public URL for a post, for `rel=canonical`, OG tags and the sitemap. */
export function canonicalUrlForPost(origin: string, post: CanonicalPostRef): string {
  return `${origin}${canonicalPathForPost(post)}`;
}
