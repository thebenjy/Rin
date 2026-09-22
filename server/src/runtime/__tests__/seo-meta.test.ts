import { describe, expect, it } from "bun:test";
import { buildHeadInjection, isUtilityRoute, robotsForListPage } from "../seo-meta";

// Utility routes short-circuit before any DB access, so a bare env is enough.
const BARE_ENV = {} as unknown as Env;

function req(path: string) {
    return new Request(`https://blog.food-signals.com${path}`);
}

describe("buildHeadInjection — utility routes", () => {
    // Previously these returned "" (no robots meta at all). An absent robots meta
    // means indexable, and robots.txt only disallows /admin/ and /api/ — so /login,
    // /profile, /user and /callback were crawlable and indexable.
    it.each([
        "/login",
        "/profile",
        "/user",
        "/user/github",
        "/callback",
        "/admin",
        "/admin/writing",
    ])("emits noindex for %s", async (path) => {
        const head = await buildHeadInjection(req(path), BARE_ENV);
        expect(head).toContain('<meta name="robots" content="noindex, nofollow">');
    });

    it("does not emit an indexable robots value for a utility route", async () => {
        const head = await buildHeadInjection(req("/login"), BARE_ENV);
        expect(head).not.toContain('content="index, follow"');
    });
});

describe("robotsForListPage", () => {
    // Engine furniture was `index, follow` AND in sitemap.xml, so under half the
    // sitemap pointed at anything worth indexing.
    it.each(["/timeline", "/moments", "/friends", "/hashtags"])(
        "excludes engine template route %s", (path) => {
            expect(robotsForListPage(path)).toBe("noindex, nofollow");
        });

    it.each(["/hashtag/glp1", "/search/nausea"])(
        "excludes listing route %s", (path) => {
            expect(robotsForListPage(path)).toBe("noindex, nofollow");
        });

    it("leaves the index indexable (undefined => the index, follow default)", () => {
        expect(robotsForListPage("/")).toBeUndefined();
    });
});

describe("isUtilityRoute", () => {
    it.each(["/login", "/profile", "/user", "/user/github", "/callback", "/admin", "/admin/writing"])(
        "classifies %s as a utility route", (path) => {
            expect(isUtilityRoute(path)).toBe(true);
        });

    it.each(["/", "/timeline", "/5", "/glp1-gastric-emptying", "/feed/5"])(
        "does not classify %s as a utility route", (path) => {
            expect(isUtilityRoute(path)).toBe(false);
        });
});
