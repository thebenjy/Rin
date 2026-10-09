// Usage: bun run scripts/report-body-links.ts <path-to-sqlite> [blog-origin] [apex-origin]
// Informational: exits 0 once the report prints, even if every post has no links.
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema";
import { buildLinkReport, formatLinkReport } from "../src/services/link-report";

const [dbPath, blogOrigin = "https://blog.food-signals.com", apexOrigin = "https://food-signals.com"] =
  process.argv.slice(2);
if (!dbPath) {
  console.error("usage: report-body-links.ts <sqlite-file> [blog-origin] [apex-origin]");
  process.exit(2);
}

// Minimal D1 look-alike over bun:sqlite, enough for drizzle's read queries.
const sqlite = new Database(dbPath, { readonly: true });
const make = (sql: string, params: unknown[]): unknown => ({
  bind: (...next: unknown[]) => make(sql, next),
  all: async () => ({ results: sqlite.prepare(sql).all(...(params as never[])), success: true, meta: {} }),
  first: async () => sqlite.prepare(sql).get(...(params as never[])) ?? null,
  raw: async () => sqlite.prepare(sql).values(...(params as never[])),
});
const d1 = { prepare: (sql: string) => make(sql, []) } as unknown as D1Database;

const db = drizzle(d1, { schema });
console.log(formatLinkReport(await buildLinkReport(db, schema, blogOrigin), apexOrigin));
