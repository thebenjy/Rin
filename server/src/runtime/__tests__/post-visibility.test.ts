import { describe, expect, it } from "bun:test";
import { resolvePostVisibility, hasValidSession, shouldHideUnpublishedPost } from "../post-visibility";
import createJWT from "../../utils/jwt";

const SECRET = "test-jwt-secret";
const BARE_ENV = {} as unknown as Env;
const ENV = { JWT_SECRET: SECRET } as unknown as Env;

const req = (path: string, init?: RequestInit) =>
    new Request(`https://blog.food-signals.com${path}`, init);

describe("resolvePostVisibility — route classification", () => {
    // These return before any DB access, so a bare env proves no query is issued.
    it.each(["/", "/timeline", "/moments", "/friends", "/hashtags"])(
        "does not treat %s as a post route", async (path) => {
            expect((await resolvePostVisibility(req(path), BARE_ENV)).isPostRoute).toBe(false);
        });

    it.each(["/login", "/admin/writing", "/profile", "/user/github", "/callback"])(
        "does not treat utility route %s as a post route", async (path) => {
            expect((await resolvePostVisibility(req(path), BARE_ENV)).isPostRoute).toBe(false);
        });

    it.each(["/hashtag/glp1", "/search/nausea"])(
        "does not treat listing route %s as a post route", async (path) => {
            expect((await resolvePostVisibility(req(path), BARE_ENV)).isPostRoute).toBe(false);
        });

    it("never hides a non-post route", async () => {
        expect(await shouldHideUnpublishedPost(req("/timeline"), BARE_ENV)).toBe(false);
        expect(await shouldHideUnpublishedPost(req("/"), BARE_ENV)).toBe(false);
    });
});


describe("hasValidSession", () => {
    it("is false with no token at all", async () => {
        expect(await hasValidSession(req("/5"), ENV)).toBe(false);
    });

    it("is false when JWT_SECRET is not configured", async () => {
        expect(await hasValidSession(req("/5"), BARE_ENV)).toBe(false);
    });

    it("is false for a garbage cookie token", async () => {
        expect(await hasValidSession(req("/5", { headers: { cookie: "token=not-a-jwt" } }), ENV))
            .toBe(false);
    });

    it("is false for a token signed with a different secret", async () => {
        const foreign = await createJWT("some-other-secret").sign({ id: 1 });
        expect(await hasValidSession(req("/5", { headers: { cookie: `token=${foreign}` } }), ENV))
            .toBe(false);
    });

    it("is true for a valid token in the cookie", async () => {
        const token = await createJWT(SECRET).sign({ id: 1 });
        expect(await hasValidSession(req("/5", { headers: { cookie: `token=${token}` } }), ENV))
            .toBe(true);
    });

    it("is true for a valid token in the Authorization header", async () => {
        const token = await createJWT(SECRET).sign({ id: 1 });
        expect(await hasValidSession(req("/5", { headers: { authorization: `Bearer ${token}` } }), ENV))
            .toBe(true);
    });

    it("reads the token cookie alongside other cookies", async () => {
        const token = await createJWT(SECRET).sign({ id: 1 });
        const cookie = `fs_attr=%7B%7D; token=${token}; fs_internal_notrack=1`;
        expect(await hasValidSession(req("/5", { headers: { cookie } }), ENV)).toBe(true);
    });
});

describe("route reservation stays in sync with the alias reservation", () => {
    // NON_POST_PREFIXES/NON_POST_EXACT (route matching) and RESERVED_ALIASES (alias
    // validity) are two lists by necessity — see the comment above NON_POST_PREFIXES
    // — but every bare word one encodes must appear in the other, or a title could
    // generate an alias that silently collides with an engine route (or vice versa,
    // a route gets added here without also blocking it as an alias).
    it("every reserved route name is also a reserved alias", async () => {
        const { RESERVED_ALIASES } = await import("../../utils/canonical");
        const routeWords = ["admin", "callback", "login", "profile", "user", "timeline", "moments", "friends", "hashtags"];
        for (const word of routeWords) {
            expect(RESERVED_ALIASES.has(word)).toBe(true);
        }
    });
});
