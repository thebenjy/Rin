import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildIndexBodyInjection, renderIndexFragment } from "../index-fragment";
import { renderPostFragment } from "../post-fragment";
import { reduceMarkdown } from "../post-markdown";
import { blogReq, seededEnv } from "./d1-test-env";

const BARE_ENV = {} as unknown as Env;

const PROSE = "Gastric emptying slows on a GLP-1.";

const env = seededEnv([
  {
    id: 1,
    alias: "gastric-emptying",
    title: "Why Your Stomach Feels Stuck",
    content: `## What is happening\n\n${PROSE} See [the score](/food-signals-score) and [Rin](https://example.com/x).\n\n- eat slowly\n- small portions\n`,
  },
  { id: 2, alias: null, title: "No alias post", content: "Plain body words here." },
  { id: 3, alias: "a-draft", title: "Secret draft title", content: "Unreleased draft body text.", draft: 1 },
  { id: 4, alias: "an-unlisted", title: "Unlisted title", content: "Hidden unlisted body text.", listed: 0 },
]);

describe("reduceMarkdown", () => {
  it("maps headings, paragraphs and list items in document order", () => {
    const html = reduceMarkdown("# One\n\npara a\nstill a\n\n## Two\n\n- x\n- y\n1. z\n\n### Three");
    expect(html).toBe(
      "<h1>One</h1><p>para a still a</p><h2>Two</h2><ul><li>x</li><li>y</li><li>z</li></ul><h3>Three</h3>",
    );
  });

  it("emits links as real anchors and images as their alt text", () => {
    const html = reduceMarkdown("Read [the guide](/guide?a=1&b=2) and ![a chart](https://x/y.png) now.");
    expect(html).toBe('<p>Read <a href="/guide?a=1&amp;b=2">the guide</a> and a chart now.</p>');
  });

  it("does not emit links with a script-capable scheme", () => {
    const html = reduceMarkdown("[click](javascript:alert(1)) and [d](data:text/html;base64,AAAA)");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href");
    expect(html).toContain("click");
  });

  it("strips emphasis markers without touching snake_case or prices", () => {
    const html = reduceMarkdown("**bold** and *it* and _em_ and snake_case_name costs $5 and $10 today");
    expect(html).toBe("<p>bold and it and em and snake_case_name costs $5 and $10 today</p>");
  });

  it("drops horizontal rules and keeps the surrounding prose", () => {
    expect(reduceMarkdown("before\n\n---\n\nafter")).toBe("<p>before</p><p>after</p>");
  });

  it("reduces a table to plain text rows, dropping the separator row", () => {
    const html = reduceMarkdown("| Food | Why |\n|---|---|\n| Oats | gentle |");
    expect(html).toBe("<p>Food, Why</p><p>Oats, gentle</p>");
    expect(html).not.toMatch(/\||---/);
  });

  // Task 2.4
  it("degrades a code fence, maths and an alert block to well-formed text with the prose intact", () => {
    const md = [
      "Before the fence.",
      "",
      "```python",
      "total = protein_g * 4",
      "```",
      "",
      "Energy is $E = mc^2$ inline.",
      "",
      "$$",
      "x = \\frac{a}{b}",
      "$$",
      "",
      "> [!NOTE]",
      "> Talk to your clinician first.",
      "",
      "After the block.",
    ].join("\n");
    const html = reduceMarkdown(md);

    for (const prose of [
      "Before the fence.",
      "total = protein_g * 4",
      "Energy is E = mc^2 inline.",
      "x = \\frac{a}{b}",
      "Talk to your clinician first.",
      "After the block.",
    ]) {
      expect(html).toContain(prose);
    }
    expect(html).not.toContain("```");
    expect(html).not.toContain("$$");
    expect(html).not.toContain("[!NOTE]");
    expect(html).not.toContain("> ");

    // Well-formed: every opened block tag is closed in order.
    const stack: string[] = [];
    for (const m of html.matchAll(/<(\/?)([a-z0-9]+)[^>]*>/g)) {
      if (m[1]) expect(stack.pop()).toBe(m[2]);
      else stack.push(m[2]);
    }
    expect(stack).toEqual([]);
  });

  it("keeps an unterminated code fence as text rather than dropping the rest of the post", () => {
    const html = reduceMarkdown("intro\n\n```\nstill code\n\nlast words");
    expect(html).toContain("last words");
  });
});

// Task 2.2
describe("escaping", () => {
  it("escapes <script> in a title", () => {
    const html = renderPostFragment("Blog", { title: "<script>alert(1)</script>", content: "ok" });
    expect(html).not.toContain("<script");
    expect(html).toContain("<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>");
  });

  it("escapes <script> and attribute-breaking text in a body", () => {
    const html = renderPostFragment("Blog", {
      title: "t",
      content: 'Hi <script>alert(1)</script> <img src=x onerror=alert(1)>\n\n[x"onclick="y](/ok"onmouseover="z)\n\n- <b onclick=1>',
    });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<b[ >]/i);
    expect(html).toContain("&lt;script&gt;");
    // No raw double-quote can reach an attribute.
    expect(html).not.toMatch(/href="[^"]*"[^>]*onclick/i);
    for (const m of html.matchAll(/<a [^>]*>/g)) expect(m[0]).toMatch(/^<a href="[^"<>]*">$/);
  });

  it("escapes the site name in the back-link", () => {
    expect(renderPostFragment("A <b> & B", { title: "t", content: "c" })).toContain("A &lt;b&gt; &amp; B</a>");
  });
});

describe("renderPostFragment", () => {
  it("emits the title as the h1, then the body, then a link home", () => {
    const html = renderPostFragment("Food Signals Blog", { title: "Title", content: "Body." });
    expect(html).toBe(
      '<article data-ssr-post><h1>Title</h1><p>Body.</p><nav><a href="/">Food Signals Blog</a></nav></article>',
    );
  });

  it("omits the h1 rather than emitting an empty one when the title is blank", () => {
    expect(renderPostFragment("B", { title: "  ", content: "c" })).not.toContain("<h1>");
  });
});

describe("buildIndexBodyInjection — post routes", () => {
  it("serves the title, prose and links for a published post by alias", async () => {
    const html = await buildIndexBodyInjection(blogReq("/gastric-emptying"), env);
    expect(html).toContain("<h1>Why Your Stomach Feels Stuck</h1>");
    expect(html).toContain(PROSE);
    expect(html).toContain('<a href="/food-signals-score">the score</a>');
    expect(html).toContain('<a href="https://example.com/x">Rin</a>');
    expect(html).toContain("<h2>What is happening</h2>");
  });

  it("serves the same body for /feed/<id> as for the alias form", async () => {
    const byAlias = await buildIndexBodyInjection(blogReq("/gastric-emptying"), env);
    const byId = await buildIndexBodyInjection(blogReq("/feed/1"), env);
    expect(byId).toBe(byAlias);
    expect(byId).toContain(PROSE);
  });

  it("serves a post with no alias by id", async () => {
    expect(await buildIndexBodyInjection(blogReq("/2"), env)).toContain("Plain body words here.");
  });

  it("carries at least one crawlable link even when the body has none", async () => {
    expect(await buildIndexBodyInjection(blogReq("/2"), env)).toContain('<a href="/">');
  });

  // Task 3.4
  it.each([
    ["draft by alias", "/a-draft", "Secret draft title", "Unreleased draft body"],
    ["draft by /feed/<id>", "/feed/3", "Secret draft title", "Unreleased draft body"],
    ["draft by bare id", "/3", "Secret draft title", "Unreleased draft body"],
    ["unlisted by alias", "/an-unlisted", "Unlisted title", "Hidden unlisted body"],
    ["unlisted by /feed/<id>", "/feed/4", "Unlisted title", "Hidden unlisted body"],
  ])("yields an empty fragment for %s", async (_label, path, title, body) => {
    const html = await buildIndexBodyInjection(blogReq(path), env);
    expect(html).toBe("");
    expect(html).not.toContain(title);
    expect(html).not.toContain(body);
  });

  it("yields an empty fragment for an id or alias with no row", async () => {
    expect(await buildIndexBodyInjection(blogReq("/nope"), env)).toBe("");
    expect(await buildIndexBodyInjection(blogReq("/feed/999"), env)).toBe("");
  });

  // Task 3.5 — a bare env proves no DB access happens for these routes.
  it.each(["/timeline", "/moments", "/friends", "/hashtags", "/hashtag/glp1", "/search/nausea", "/login", "/admin/writing", "/profile", "/user/github", "/callback", "/a/b/c"])(
    "gives %s no fragment, without touching the DB", async (path) => {
      expect(await buildIndexBodyInjection(blogReq(path), BARE_ENV)).toBe("");
    });

  it("fails soft to an empty fragment if the lookup throws", async () => {
    expect(await buildIndexBodyInjection(blogReq("/5"), BARE_ENV)).toBe("");
  });

  // Task 3.6 (behavioural half): the requester's identity cannot change the output.
  it("is identical for a crawler user-agent and a browser user-agent", async () => {
    const bot = await buildIndexBodyInjection(
      blogReq("/gastric-emptying", { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }),
      env,
    );
    const browser = await buildIndexBodyInjection(
      blogReq("/gastric-emptying", { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15" }),
      env,
    );
    const none = await buildIndexBodyInjection(blogReq("/gastric-emptying"), env);
    expect(bot).not.toBe("");
    expect(bot).toBe(browser);
    expect(bot).toBe(none);
  });
});

// Task 3.3
describe("index fragment is unchanged by post fragments", () => {
  // Literal captured from the pre-change renderer; do not regenerate it from the code
  // under test.
  const GOLDEN =
    '<div data-ssr-index><h1>Food Signals Blog</h1><ul>' +
    '<li><a href="/glp1-gastric-emptying">Why Your Stomach Feels Stuck</a></li>' +
    '<li><a href="/5">Bloated &amp; constipated on a GLP-1?</a></li>' +
    "</ul></div>";

  it("renderIndexFragment output is byte-identical", () => {
    expect(
      renderIndexFragment("Food Signals Blog", [
        { id: 1, alias: "glp1-gastric-emptying", title: "Why Your Stomach Feels Stuck" },
        { id: 5, alias: null, title: "Bloated & constipated on a GLP-1?" },
      ]),
    ).toBe(GOLDEN);
  });

  it("/ still gets the index fragment, listing only published posts, and no post markup", async () => {
    const only = seededEnv([
      { id: 1, alias: "glp1-gastric-emptying", title: "Why Your Stomach Feels Stuck", content: "body" },
      { id: 3, alias: "a-draft", title: "Secret draft title", content: "x", draft: 1 },
      { id: 4, alias: "an-unlisted", title: "Unlisted title", content: "x", listed: 0 },
    ]);
    const html = await buildIndexBodyInjection(blogReq("/"), only);
    expect(html).toBe(
      '<div data-ssr-index><h1>Rin</h1><ul><li><a href="/glp1-gastric-emptying">Why Your Stomach Feels Stuck</a></li></ul></div>',
    );
    expect(html).not.toContain("data-ssr-post");
  });
});

// Source-level guards. These read the runtime source so a future edit that quietly
// reintroduces a second visibility rule, or sniffs the user-agent, fails a test.
describe("source guards", () => {
  const dir = join(import.meta.dir, "..");
  const sources = readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ file: f, code: stripComments(readFileSync(join(dir, f), "utf8")) }));

  function stripComments(code: string): string {
    return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  // Task 1.3 / design D2
  it("has exactly one implementation of the draft/listed decision", () => {
    const decisions = sources.flatMap(({ file, code }) =>
      [...code.matchAll(/\b(?!feeds\b)\w+\.(draft|listed)\b/g)].map((m) => `${file}: ${m[0]}`),
    );
    // isPublishedPost in post-visibility.ts is the only place row flags are read.
    expect(decisions).toEqual(["post-visibility.ts: post.draft", "post-visibility.ts: post.listed"]);
  });

  // The one other expression of "published" is a SQL list filter (`eq(feeds.draft, 0)`),
  // which selects many rows and cannot call a row predicate. It mirrors sitemap.ts, and
  // exists only for the index fragment. A post route must never filter this way.
  it("confines the SQL-column form of the published filter to the index list query", () => {
    const columnRefs = sources
      .filter(({ code }) => /\bfeeds\.(draft|listed)\b/.test(code))
      .map(({ file }) => file);
    expect(columnRefs).toEqual(["index-fragment.ts"]);
  });

  it("keeps the fragment and the head injection on the shared resolver", () => {
    const get = (f: string) => sources.find((s) => s.file === f)!.code;
    expect(get("post-fragment.ts")).toContain("resolvePublishedPost");
    expect(get("seo-meta.ts")).toContain("resolvePublishedPost");
    expect(get("post-fragment.ts")).not.toMatch(/feeds\.findFirst/);
    expect(get("seo-meta.ts")).not.toMatch(/feeds\.findFirst/);
  });

  // Task 3.6 / design D4
  it("reads no request header or user-agent anywhere in the fragment path", () => {
    for (const file of ["index-fragment.ts", "post-fragment.ts", "post-markdown.ts"]) {
      const code = sources.find((s) => s.file === file)!.code;
      expect(code).not.toMatch(/user-?agent|\.headers\b|headers\.get|googlebot|bot\b/i);
    }
  });

  // Task 2.3 / design D3
  it("adds no markdown dependency to the Worker's reducer", () => {
    const code = sources.find((s) => s.file === "post-markdown.ts")!.code;
    const imports = [...code.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["./seo-meta"]);
  });
});
