import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Exercises the actual inline scripts shipped in client/index.html (not a
// reimplementation), so drift between this test and the real gate is caught.
const indexHtmlPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../index.html",
);
const indexHtml = readFileSync(indexHtmlPath, "utf-8");

function extractInlineScript(marker: string): string {
  const scripts = indexHtml.match(/<script>([\s\S]*?)<\/script>/g) ?? [];
  const found = scripts.find((script) => script.includes(marker));
  if (!found) {
    throw new Error(`Could not find an inline <script> in index.html containing "${marker}"`);
  }
  return found.replace(/^<script>/, "").replace(/<\/script>$/, "");
}

type GlobalWithTrackingGate = typeof globalThis & {
  __RIN_LOGGED_IN__?: boolean;
  __RIN_EXCLUDE_TRACKING__?: () => boolean;
};

function resetTrackingState() {
  const g = globalThis as GlobalWithTrackingGate;
  delete g.__RIN_LOGGED_IN__;
  delete g.__RIN_EXCLUDE_TRACKING__;
  document.cookie = "fs_internal_notrack=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
}

function runExclusionGateDefinition() {
  new Function(extractInlineScript("__RIN_EXCLUDE_TRACKING__ = function"))();
}

describe("index.html tracking exclusion gate", () => {
  beforeEach(() => {
    resetTrackingState();
    runExclusionGateDefinition();
  });

  afterEach(resetTrackingState);

  it("does not exclude an anonymous reader with no logged-in flag or cookie", () => {
    expect((globalThis as GlobalWithTrackingGate).__RIN_EXCLUDE_TRACKING__!()).toBe(false);
  });

  it("excludes a request whose bootstrap.js reported __RIN_LOGGED_IN__ = true", () => {
    (globalThis as GlobalWithTrackingGate).__RIN_LOGGED_IN__ = true;
    expect((globalThis as GlobalWithTrackingGate).__RIN_EXCLUDE_TRACKING__!()).toBe(true);
  });

  it("excludes a browser carrying fs_internal_notrack without an active blog session", () => {
    (globalThis as GlobalWithTrackingGate).__RIN_LOGGED_IN__ = false;
    document.cookie = "fs_internal_notrack=1; path=/";
    expect((globalThis as GlobalWithTrackingGate).__RIN_EXCLUDE_TRACKING__!()).toBe(true);
  });
});

describe("index.html ships no third-party analytics", () => {
  it("contains no GTM or GA4 id and no Google tag loader", () => {
    expect(indexHtml).not.toMatch(/GTM-[A-Z0-9]{5,}/);
    expect(indexHtml).not.toMatch(/\bG-[A-Z0-9]{8,}\b/);
    expect(indexHtml).not.toContain("googletagmanager.com");
    expect(indexHtml).not.toContain("google-analytics.com");
  });
});
