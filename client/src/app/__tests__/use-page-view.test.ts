import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { pushPageView } from "../use-page-view";
import { canonicalPagePath } from "../../utils/canonical-path";

interface G {
    dataLayer?: Record<string, unknown>[];
    __RIN_EXCLUDE_TRACKING__?: () => boolean;
}
const g = globalThis as unknown as G;

describe("canonicalPagePath", () => {
    it("normalises the internal /feed/:id route to the public form", () => {
        expect(canonicalPagePath("/feed/5")).toBe("/5");
        expect(canonicalPagePath("/feed/5/")).toBe("/5");
    });

    it("leaves an alias path untouched", () => {
        expect(canonicalPagePath("/glp1-gastric-emptying")).toBe("/glp1-gastric-emptying");
    });

    it("keeps the root as /", () => {
        expect(canonicalPagePath("/")).toBe("/");
    });
});

describe("pushPageView", () => {
    beforeEach(() => {
        g.dataLayer = [];
        delete g.__RIN_EXCLUDE_TRACKING__;
    });
    afterEach(() => {
        delete g.dataLayer;
        delete g.__RIN_EXCLUDE_TRACKING__;
    });

    it("pushes a pageview carrying the canonical path", () => {
        pushPageView("/feed/5");
        expect(g.dataLayer).toHaveLength(1);
        expect(g.dataLayer![0]).toMatchObject({ event: "rin_page_view", page_path: "/5" });
    });

    it("reports each navigation separately", () => {
        pushPageView("/");
        pushPageView("/glp1-gastric-emptying");
        pushPageView("/feed/5");
        expect(g.dataLayer!.map((e) => e.page_path)).toEqual([
            "/", "/glp1-gastric-emptying", "/5",
        ]);
    });

    it("pushes nothing for a staff browser", () => {
        g.__RIN_EXCLUDE_TRACKING__ = () => true;
        pushPageView("/5");
        expect(g.dataLayer).toHaveLength(0);
    });

    it("still tracks when the gate says the reader is anonymous", () => {
        g.__RIN_EXCLUDE_TRACKING__ = () => false;
        pushPageView("/5");
        expect(g.dataLayer).toHaveLength(1);
    });

    it("fails open to tracking if the gate throws", () => {
        g.__RIN_EXCLUDE_TRACKING__ = () => { throw new Error("boom"); };
        pushPageView("/5");
        expect(g.dataLayer).toHaveLength(1);
    });

    it("is a no-op when GTM never initialised dataLayer", () => {
        delete g.dataLayer;
        expect(() => pushPageView("/5")).not.toThrow();
    });
});
