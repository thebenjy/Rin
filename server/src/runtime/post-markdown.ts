import { escapeHtml } from "./seo-meta";

// Reduces a post's markdown to crawlable HTML: headings, paragraphs, list items, real
// <a href> links and image alt text. It is NOT a markdown renderer and must not grow
// into one — the client renders with react-markdown + remark plugins, and this output
// is replaced by that render on mount (see index-fragment.ts). A crawler needs the
// words, the heading structure and the outbound links; it does not need a rendered
// equation. Anything not handled below degrades to plain text, never to raw syntax.
//
// Built from the strip chain in seo-meta.ts (excerptFromMarkdown) — same primitives,
// applied per block instead of to the whole document. No markdown dependency: see
// openspec/changes/prerender-post-bodies-for-crawlers/design.md D3.
//
// Every value interpolated into the output goes through escapeHtml.

// Bounds the work a single request can do. Posts are ~10 KB; this is generous.
const MAX_INPUT_CHARS = 200_000;

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const BLOCKQUOTE = /^\s*>\s?(.*)$/;
const ALERT_MARKER = /^\[![A-Za-z]+\]\s*$/;
const MATH_FENCE = /^\s*\$\$\s*$/;

const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/)|#|\?)/i;

/** True for link targets safe to emit: http(s), mailto, and same-site relative paths. */
function isSafeHref(href: string): boolean {
  return SAFE_HREF.test(href);
}

// Placeholders let links be emitted as markup while everything around them is escaped.
const OPEN = "\u0000";
const CLOSE = "\u0001";

function stripEmphasis(text: string): string {
  return text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^\w])__([^_]+)__(?=[^\w]|$)/g, "$1$2")
    .replace(/\*([^*\s][^*]*)\*/g, "$1")
    .replace(/(^|[^\w])_([^_\s][^_]*)_(?=[^\w]|$)/g, "$1$2")
    .replace(/~~([^~]+)~~/g, "$1");
}

// $e = mc^2$ -> e = mc^2, keeping prices like "$5 and $10" intact (opening $ must be
// followed by non-space, closing $ preceded by non-space and not followed by a digit).
function stripInlineMath(text: string): string {
  return text.replace(/\$(?=\S)([^$\n]*?\S)\$(?!\d)/g, "$1");
}

/** Inline markdown -> escaped HTML with real anchors. */
export function reduceInline(raw: string): string {
  const anchors: string[] = [];

  let text = raw.replace(/[\u0000\u0001]/g, "");

  // Images -> alt text.
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");

  // Links -> placeholder holding the finished anchor.
  text = text.replace(/\[([^\]]*)\]\(\s*<?([^\s)>]*)>?(?:\s+["'][^)]*["'])?\s*\)/g, (_m, label: string, href: string) => {
    const inner = escapeHtml(stripEmphasis(stripInlineMath(label)).trim());
    if (!isSafeHref(href) || !inner) {
      return inner;
    }
    anchors.push(`<a href="${escapeHtml(href)}">${inner}</a>`);
    return `${OPEN}${anchors.length - 1}${CLOSE}`;
  });

  // <https://example.com> autolinks.
  text = text.replace(/<(https?:\/\/[^\s<>]+)>/g, (_m, href: string) => {
    anchors.push(`<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>`);
    return `${OPEN}${anchors.length - 1}${CLOSE}`;
  });

  const plain = escapeHtml(stripEmphasis(stripInlineMath(text)));
  return plain.replace(new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g"), (_m, i: string) => anchors[Number(i)] ?? "");
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
}

/**
 * Markdown -> crawlable HTML. Block elements are emitted in document order.
 * Tables, code fences, maths and alert blockquotes reduce to paragraphs of plain text.
 */
export function reduceMarkdown(markdown: string): string {
  const lines = markdown.slice(0, MAX_INPUT_CHARS).replace(/\r\n?/g, "\n").split("\n");

  const out: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let fence: string | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      const html = reduceInline(paragraph.join(" ").replace(/\s+/g, " ").trim());
      if (html) out.push(`<p>${html}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems.length) {
      out.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join("")}</ul>`);
      listItems = [];
    }
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (const line of lines) {
    // Fenced code: the delimiter lines are dropped, the code is kept as plain text.
    const fenceMatch = FENCE.exec(line);
    if (fence) {
      if (fenceMatch && fenceMatch[1] === fence) {
        fence = null;
        flushParagraph();
      } else if (line.trim()) {
        out.push(`<p>${escapeHtml(line.trim())}</p>`);
      }
      continue;
    }
    if (fenceMatch) {
      flush();
      fence = fenceMatch[1];
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    // $$ on its own line delimits a maths block; keep the expression, drop the delimiter.
    if (MATH_FENCE.test(line)) {
      flush();
      continue;
    }

    if (HR.test(line)) {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      const html = reduceInline(heading[2]);
      if (html) out.push(`<h${level}>${html}</h${level}>`);
      continue;
    }

    if (TABLE_ROW.test(line)) {
      flush();
      if (!TABLE_SEPARATOR.test(line)) {
        const html = reduceInline(tableCells(line).join(", "));
        if (html) out.push(`<p>${html}</p>`);
      }
      continue;
    }

    const quote = BLOCKQUOTE.exec(line);
    if (quote) {
      // GitHub alert marker ("> [!NOTE]") is a delimiter, not content.
      if (!ALERT_MARKER.test(quote[1].trim()) && quote[1].trim()) {
        flushList();
        paragraph.push(quote[1]);
      } else {
        flush();
      }
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      flushParagraph();
      const html = reduceInline(item[1]);
      if (html) listItems.push(html);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flush();
  return out.join("");
}
