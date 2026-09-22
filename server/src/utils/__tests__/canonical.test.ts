import { describe, expect, it } from "bun:test";
import { canonicalPathForPost, canonicalUrlForPost } from "../canonical";

const ORIGIN = "https://blog.food-signals.com";

describe("canonicalPathForPost", () => {
    it("uses the alias when one is set", () => {
        expect(canonicalPathForPost({ id: 1, alias: "glp1-gastric-emptying" }))
            .toBe("/glp1-gastric-emptying");
    });

    // Regression guard for the defect this module exists to prevent: the no-alias
    // fallback used to be `/feed/${id}` in seo-meta while the sitemap said `/${id}`.
    it("falls back to the id, not /feed/<id>, when the alias is absent", () => {
        expect(canonicalPathForPost({ id: 5, alias: null })).toBe("/5");
        expect(canonicalPathForPost({ id: 5 })).toBe("/5");
    });

    it("treats an empty or whitespace alias as absent", () => {
        expect(canonicalPathForPost({ id: 7, alias: "" })).toBe("/7");
        expect(canonicalPathForPost({ id: 7, alias: "   " })).toBe("/7");
    });

    it("builds an absolute URL against the request origin", () => {
        expect(canonicalUrlForPost(ORIGIN, { id: 9, alias: null }))
            .toBe(`${ORIGIN}/9`);
        expect(canonicalUrlForPost(ORIGIN, { id: 9, alias: "which-glp1-app" }))
            .toBe(`${ORIGIN}/which-glp1-app`);
    });
});
