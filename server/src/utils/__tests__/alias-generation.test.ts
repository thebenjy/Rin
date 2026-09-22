import { describe, expect, it, afterEach } from "bun:test";
import { generateUniqueAlias } from "../alias-generation";
import { slugify } from "../slugify";
import { createMockDB, cleanupTestDB, createTestUser } from "../../../tests/fixtures";

describe("generateUniqueAlias", () => {
    let sqlite: ReturnType<typeof createMockDB>["sqlite"];

    afterEach(() => {
        if (sqlite) cleanupTestDB(sqlite);
    });

    // Matches the established pattern in feed.test.ts/tag.test.ts: the fixture's
    // bun-sqlite-backed drizzle instance isn't assignable to the strict D1 type
    // generateUniqueAlias declares (DrizzleD1Database), so it's typed `any` at the
    // test boundary — same as every other test that calls a DB-typed function
    // directly rather than through the Hono app (which erases types at the HTTP
    // boundary instead).
    function setup(): any {
        const mock = createMockDB();
        sqlite = mock.sqlite;
        createTestUser(sqlite);
        return mock.db;
    }

    it("returns the plain slug when there is no collision", async () => {
        const db = setup();
        const alias = await generateUniqueAlias(db, "Waking up with heartburn on Ozempic");
        expect(alias).toBe("waking-up-with-heartburn-on-ozempic");
    });

    it("appends -2 when the base slug is already taken", async () => {
        const db = setup();
        sqlite.exec(`INSERT INTO feeds (id, alias, title, content, uid, draft, listed)
                     VALUES (1, 'ozempic-basics', 'Ozempic Basics', 'x', 1, 0, 1)`);
        const alias = await generateUniqueAlias(db, "Ozempic Basics");
        expect(alias).toBe("ozempic-basics-2");
    });

    it("finds the next free suffix when several are taken", async () => {
        const db = setup();
        sqlite.exec(`INSERT INTO feeds (id, alias, title, content, uid, draft, listed) VALUES
            (1, 'ozempic-basics', 'a', 'x', 1, 0, 1),
            (2, 'ozempic-basics-2', 'b', 'x', 1, 0, 1),
            (3, 'ozempic-basics-3', 'c', 'x', 1, 0, 1)`);
        const alias = await generateUniqueAlias(db, "Ozempic Basics");
        expect(alias).toBe("ozempic-basics-4");
    });

    it("excludes the post's own row so updating without changing the title doesn't collide with itself", async () => {
        const db = setup();
        sqlite.exec(`INSERT INTO feeds (id, alias, title, content, uid, draft, listed)
                     VALUES (1, 'ozempic-basics', 'Ozempic Basics', 'x', 1, 0, 1)`);
        const alias = await generateUniqueAlias(db, "Ozempic Basics", { excludeId: 1 });
        expect(alias).toBe("ozempic-basics");
    });

    it("returns null for a title that slugifies to a reserved route name", async () => {
        const db = setup();
        expect(await generateUniqueAlias(db, "Timeline")).toBeNull();
        expect(await generateUniqueAlias(db, "Login")).toBeNull();
    });

    it("returns null for an all-digit slug", async () => {
        const db = setup();
        expect(await generateUniqueAlias(db, "2026")).toBeNull();
    });

    it("returns null for a title with no usable characters", async () => {
        const db = setup();
        expect(await generateUniqueAlias(db, "🎉🎊")).toBeNull();
    });

    // Regression test for a bug caught only in production: Cloudflare D1 rejects a
    // LIKE pattern once its literal prefix passes ~50 characters ("LIKE or GLOB
    // pattern too complex", SQLITE_ERROR 7500) — local bun:sqlite does not enforce
    // this, so an earlier implementation using `like(feeds.alias, base + '%')`
    // passed every test here and broke the first real publish against D1. Doesn't
    // reproduce the D1-specific error locally (bun:sqlite has no such limit), but
    // guards the fix: collision-checking must not depend on alias length.
    it("resolves a collision for a long, 50+ character slug", async () => {
        const db = setup();
        const longTitle = "This Title Is Long Enough To Exceed Fifty Characters Once Slugified";
        const base = slugify(longTitle)!;
        expect(base.length).toBeGreaterThan(50);
        sqlite.exec(`INSERT INTO feeds (id, alias, title, content, uid, draft, listed)
                     VALUES (1, '${base}', 'x', 'x', 1, 0, 1)`);
        const alias = await generateUniqueAlias(db, longTitle);
        expect(alias).toBe(`${base}-2`);
    });
});
