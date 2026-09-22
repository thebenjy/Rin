import { describe, expect, it, mock } from "bun:test";
import { resolveAliasForSave } from "../alias-generation";

describe("resolveAliasForSave", () => {
    it("uses the author-supplied alias verbatim when present", async () => {
        const generate = mock(async () => "should-not-be-used");
        const result = await resolveAliasForSave(null, "my-chosen-slug", "Some Title", generate);
        expect(result).toBe("my-chosen-slug");
        expect(generate).not.toHaveBeenCalled();
    });

    it("keeps the existing alias when the incoming one is empty", async () => {
        const generate = mock(async () => "should-not-be-used");
        const result = await resolveAliasForSave("already-set", "", "New Title", generate);
        expect(result).toBe("already-set");
        expect(generate).not.toHaveBeenCalled();
    });

    it("keeps the existing alias when the incoming one is whitespace only", async () => {
        const generate = mock(async () => "should-not-be-used");
        const result = await resolveAliasForSave("already-set", "   ", "New Title", generate);
        expect(result).toBe("already-set");
    });

    it("generates from the title when neither incoming nor existing is present", async () => {
        const generate = mock(async (title: string) => `generated-from-${title}`);
        const result = await resolveAliasForSave(null, null, "My Title", generate);
        expect(result).toBe("generated-from-My Title");
        expect(generate).toHaveBeenCalledTimes(1);
    });

    it("generates on first create (existing undefined, not just null)", async () => {
        const generate = mock(async () => "created-slug");
        const result = await resolveAliasForSave(undefined, undefined, "My Title", generate);
        expect(result).toBe("created-slug");
    });

    it("an incoming alias wins even when an existing one is also set", async () => {
        const generate = mock(async () => "should-not-be-used");
        const result = await resolveAliasForSave("old-slug", "new-slug", "Title", generate);
        expect(result).toBe("new-slug");
        expect(generate).not.toHaveBeenCalled();
    });

    it("trims a supplied alias", async () => {
        const generate = mock(async () => "should-not-be-used");
        const result = await resolveAliasForSave(null, "  spaced-slug  ", "Title", generate);
        expect(result).toBe("spaced-slug");
    });
});
