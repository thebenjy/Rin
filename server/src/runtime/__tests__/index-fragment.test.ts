import { describe, expect, it } from "bun:test";
import { renderIndexFragment, buildIndexBodyInjection } from "../index-fragment";
import { canonicalPathForPost } from "../../utils/canonical";

const POSTS = [
    { id: 1, alias: "glp1-gastric-emptying", title: "Why Your Stomach Feels Stuck" },
    { id: 5, alias: null, title: "Bloated & constipated on a GLP-1?" },
];

describe("renderIndexFragment", () => {
    it("emits exactly one h1 carrying the site name", () => {
        const html = renderIndexFragment("Food Signals Blog", POSTS);
        expect([...html.matchAll(/<h1>/g)]).toHaveLength(1);
        expect(html).toContain("<h1>Food Signals Blog</h1>");
    });

    it("emits an anchor per post at its canonical path", () => {
        const html = renderIndexFragment("Blog", POSTS);
        for (const post of POSTS) {
            expect(html).toContain(`href="${canonicalPathForPost(post)}"`);
        }
        expect([...html.matchAll(/<a href=/g)]).toHaveLength(POSTS.length);
    });

    it("links a post with no alias by id, matching the sitemap", () => {
        expect(renderIndexFragment("Blog", POSTS)).toContain('href="/5"');
        expect(renderIndexFragment("Blog", POSTS)).not.toContain('href="/feed/5"');
    });

    it("escapes titles and site name", () => {
        const html = renderIndexFragment('A & B', [{ id: 2, alias: null, title: '<script>x</script>' }]);
        expect(html).toContain("A &amp; B");
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
    });

    it("falls back to the path when a post has no title", () => {
        expect(renderIndexFragment("Blog", [{ id: 8, alias: null, title: null }]))
            .toContain('<a href="/8">8</a>');
    });
});

describe("buildIndexBodyInjection", () => {
    it("returns nothing for a non-index route, without touching the DB", async () => {
        const env = {} as unknown as Env;
        expect(await buildIndexBodyInjection(new Request("https://b.example/5"), env)).toBe("");
        expect(await buildIndexBodyInjection(new Request("https://b.example/timeline"), env)).toBe("");
    });
});
