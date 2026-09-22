import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import type { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { SitemapService } from "../sitemap";
import { setupTestApp, cleanupTestDB, seedTestData } from "../../../tests/fixtures";
import { canonicalUrlForPost } from "../../utils/canonical";

describe("SitemapService", () => {
    let sqlite: Database;
    let app: Hono<any>;

    beforeEach(async () => {
        const ctx = await setupTestApp(SitemapService);
        sqlite = ctx.sqlite;
        app = ctx.app as Hono<any>;
        seedTestData(sqlite);
    });

    afterEach(() => cleanupTestDB(sqlite));

    async function sitemap() {
        const res = await app.request("/sitemap.xml");
        expect(res.status).toBe(200);
        return res.text();
    }

    function locs(xml: string) {
        return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    }

    it("does not advertise engine template routes", async () => {
        const found = locs(await sitemap());
        for (const route of ["/timeline", "/moments", "/hashtags", "/friends"]) {
            expect(found.some((l) => l.endsWith(route))).toBe(false);
        }
    });

    it("lists the index plus published posts only", async () => {
        const found = locs(await sitemap());
        const origin = new URL(found[0]).origin;
        expect(found[0]).toBe(`${origin}/`);
        // seedTestData inserts feeds 1 and 2, both draft=0 listed=1, no alias.
        expect(found).toContain(`${origin}/1`);
        expect(found).toContain(`${origin}/2`);
        expect(found).toHaveLength(3);
    });

    it("advertises the same URL the canonical helper produces", async () => {
        const found = locs(await sitemap());
        const origin = new URL(found[0]).origin;
        expect(found).toContain(canonicalUrlForPost(origin, { id: 1, alias: null }));
    });

    it("omits drafts and unlisted posts", async () => {
        sqlite.exec(`INSERT INTO feeds (id, title, content, uid, draft, listed)
                     VALUES (90, 'Draft', 'x', 1, 1, 1), (91, 'Unlisted', 'x', 1, 0, 0)`);
        const found = locs(await sitemap());
        const origin = new URL(found[0]).origin;
        expect(found).not.toContain(`${origin}/90`);
        expect(found).not.toContain(`${origin}/91`);
    });
});
