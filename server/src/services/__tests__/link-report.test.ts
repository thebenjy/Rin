import { describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { seededEnv, type SeedPost } from "../../runtime/__tests__/d1-test-env";
import { buildLinkReport, countBodyAnchors, formatLinkReport, HUB_PAGES } from "../link-report";

const ORIGIN = "https://blog.food-signals.com";
const APEX = "https://food-signals.com";
const report = (posts: SeedPost[]) => buildLinkReport(drizzle(seededEnv(posts).DB, { schema }), schema, ORIGIN);

describe("countBodyAnchors", () => {
  it("excludes the fragment's own nav anchor", () => {
    expect(countBodyAnchors('<article data-ssr-post><p>x</p><nav><a href="/">Blog</a></nav></article>')).toBe(0);
  });
});

describe("buildLinkReport", () => {
  // Task 2.1
  it("reports zero for a post with no body links, nav anchor excluded", async () => {
    const r = await report([{ id: 1, alias: "plain", title: "Plain", content: "No links here." }]);
    expect(r.posts).toEqual([{ url: `${ORIGIN}/plain`, bodyAnchors: 0 }]);
  });

  // Task 2.2
  it("reports two for a post with two body links", async () => {
    const r = await report([
      { id: 1, alias: "linked", title: "Linked", content: "See [a](/family) and [b](https://example.com/x)." },
    ]);
    expect(r.posts[0].bodyAnchors).toBe(2);
  });

  it("uses the id as the canonical path when a post has no alias", async () => {
    const r = await report([{ id: 7, title: "No alias", content: "x" }]);
    expect(r.posts[0].url).toBe(`${ORIGIN}/7`);
  });

  // Task 2.3
  it("omits drafts and unlisted posts", async () => {
    const r = await report([
      { id: 1, alias: "pub", title: "Pub", content: "x" },
      { id: 2, alias: "a-draft", title: "D", content: "x", draft: 1 },
      { id: 3, alias: "unlisted", title: "U", content: "x", listed: 0 },
    ]);
    expect(r.posts.map((p) => p.url)).toEqual([`${ORIGIN}/pub`]);
    expect(r.published).toBe(1);
  });

  // Task 2.4 — the corpus-level state is asserted explicitly so "no post links" is a
  // recorded fact rather than a condition the crawlable-links requirement passes over
  // vacuously.
  it("records the number of posts with a body anchor, even when it is zero", async () => {
    const r = await report([
      { id: 1, alias: "a", title: "A", content: "No links." },
      { id: 2, alias: "b", title: "B", content: "Still none." },
    ]);
    expect(r.withBodyAnchors).toBe(0);
    expect(r.published).toBe(2);
    expect(formatLinkReport(r, APEX)).toContain("Posts with at least one body link: 0 of 2");
  });

  it("counts a corpus where some posts link", async () => {
    const r = await report([
      { id: 1, alias: "a", title: "A", content: "No links." },
      { id: 2, alias: "b", title: "B", content: "[hub](/family)" },
    ]);
    expect(r.withBodyAnchors).toBe(1);
  });
});

describe("formatLinkReport", () => {
  it("names each zero-link post's URL and every hub page", async () => {
    const out = formatLinkReport(await report([{ id: 1, alias: "plain", title: "Plain", content: "No links." }]), APEX);
    expect(out).toContain(`${ORIGIN}/plain`);
    for (const hub of HUB_PAGES) expect(out).toContain(`${APEX}${hub}`);
  });

  it("omits the hub list when every post already links", async () => {
    const out = formatLinkReport(await report([{ id: 1, alias: "a", title: "A", content: "[x](/family)" }]), APEX);
    expect(out).not.toContain("Hub pages");
  });
});
