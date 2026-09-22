// Turns a post title into a URL-safe slug. Pure and synchronous — collision checking
// and reserved-word handling happen one layer up in alias-generation.ts, which is the
// piece that needs the database.

const DEFAULT_MAX_LENGTH = 60;

/**
 * Lowercase, hyphenated slug from a title, or `null` if the title has no
 * alphanumeric characters to build one from (e.g. pure emoji or punctuation) — the
 * caller should fall back to the existing no-alias behaviour in that case, not store
 * an empty string.
 */
export function slugify(title: string, maxLength: number = DEFAULT_MAX_LENGTH): string | null {
  const slug = title
    .toLowerCase()
    // Drop anything that isn't a letter, digit, or whitespace/hyphen before
    // collapsing separators, so "GLP-1: What to eat?" keeps its digit and drops the
    // punctuation cleanly rather than leaving stray hyphens around it.
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    return null;
  }

  if (slug.length <= maxLength) {
    return slug;
  }

  // Trim to the last hyphen before the limit, so the cut lands on a word boundary
  // instead of mid-word.
  const truncated = slug.slice(0, maxLength);
  const lastHyphen = truncated.lastIndexOf("-");
  const trimmed = lastHyphen > 0 ? truncated.slice(0, lastHyphen) : truncated;
  return trimmed.replace(/-+$/, "") || truncated;
}
