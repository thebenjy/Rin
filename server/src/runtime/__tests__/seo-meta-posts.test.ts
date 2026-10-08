import { describe, expect, it } from "bun:test";
import { buildHeadInjection } from "../seo-meta";
import { blogReq, seededEnv } from "./d1-test-env";

// Characterises buildHeadInjection for post routes. Written before the post
// resolution was extracted into post-visibility.ts and run against the old code, so a
// pass here means the extraction changed nothing observable.

const env = seededEnv([
  { id: 1, alias: "gastric-emptying", title: "Why Your Stomach Feels Stuck", summary: "A dietitian explains.", content: "Body text." },
  { id: 2, alias: null, title: "No alias post", content: "Plain body." },
  { id: 3, alias: "a-draft", title: "Secret draft", content: "Unreleased.", draft: 1 },
  { id: 4, alias: "an-unlisted", title: "Unlisted", content: "Hidden.", listed: 0 },
]);

describe("buildHeadInjection — post routes", () => {
  it("emits an indexable, self-canonical head for a published post by alias", async () => {
    const head = await buildHeadInjection(blogReq("/gastric-emptying"), env);
    expect(head).toContain("<title>Why Your Stomach Feels Stuck - ");
    expect(head).toContain('<meta name="robots" content="index, follow">');
    expect(head).toContain('<link rel="canonical" href="https://blog.food-signals.com/gastric-emptying">');
    expect(head).toContain('"@type":"BlogPosting"');
    expect(head).toContain('"@type":"BreadcrumbList"');
    expect(head).toContain('<meta name="description" content="A dietitian explains.">');
  });

  it("canonicalises /feed/<id> to the alias form", async () => {
    const head = await buildHeadInjection(blogReq("/feed/1"), env);
    expect(head).toContain('<link rel="canonical" href="https://blog.food-signals.com/gastric-emptying">');
  });

  it("uses /<id> as canonical for a post with no alias", async () => {
    const head = await buildHeadInjection(blogReq("/2"), env);
    expect(head).toContain('<link rel="canonical" href="https://blog.food-signals.com/2">');
    expect(head).toContain('<meta name="robots" content="index, follow">');
  });

  it.each(["/a-draft", "/feed/3", "/3", "/an-unlisted", "/feed/4"])(
    "emits noindex and no post content for unpublished %s", async (path) => {
      const head = await buildHeadInjection(blogReq(path), env);
      expect(head).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(head).not.toContain("BlogPosting");
      expect(head).not.toContain("Secret draft");
      expect(head).not.toContain("Unlisted");
    });

  it("emits noindex for an id or alias with no row", async () => {
    const head = await buildHeadInjection(blogReq("/nope"), env);
    expect(head).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(head).not.toContain("BlogPosting");
  });

  it("returns nothing for a multi-segment path that is not a post route", async () => {
    expect(await buildHeadInjection(blogReq("/a/b/c"), env)).toBe("");
  });
});
