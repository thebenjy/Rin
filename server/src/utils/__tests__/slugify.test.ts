import { describe, expect, it } from "bun:test";
import { slugify } from "../slugify";

describe("slugify", () => {
    it("lowercases and hyphenates a normal title", () => {
        expect(slugify("Waking up with heartburn on Ozempic or Mounjaro?"))
            .toBe("waking-up-with-heartburn-on-ozempic-or-mounjaro");
    });

    it("strips punctuation without leaving stray hyphens", () => {
        expect(slugify('Why Your Stomach Feels "Stuck": The Science'))
            .toBe("why-your-stomach-feels-stuck-the-science");
    });

    it("keeps digits", () => {
        expect(slugify("GLP-1 basics")).toBe("glp-1-basics");
    });

    it("collapses multiple separators into one hyphen", () => {
        expect(slugify("what --- now??")).toBe("what-now");
    });

    it("trims leading and trailing hyphens", () => {
        expect(slugify("  - hello world -  ")).toBe("hello-world");
    });

    it("returns null for a title with no alphanumeric characters", () => {
        expect(slugify("🎉🎊")).toBeNull();
        expect(slugify("???")).toBeNull();
        expect(slugify("")).toBeNull();
    });

    it("truncates to a word boundary under the length cap", () => {
        const long = "this is a very long title that keeps going well past sixty characters in total length";
        const result = slugify(long, 30);
        expect(result!.length).toBeLessThanOrEqual(30);
        expect(result).not.toMatch(/-$/);
        // Cuts on a whole word, not mid-word.
        expect(long.replace(/\s+/g, "-")).toContain(result);
    });

    it("does not cut mid-word when a single word exceeds the cap", () => {
        const result = slugify("supercalifragilisticexpialidocious", 10);
        expect(result).toBe("supercalifragilisticexpialidocious".slice(0, 10));
    });

    it("defaults to a 60-character cap", () => {
        const long = "a".repeat(100);
        expect(slugify(long)!.length).toBeLessThanOrEqual(60);
    });
});
