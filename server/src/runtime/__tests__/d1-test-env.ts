import { createMockDB, createMockEnv } from "../../../tests/fixtures";

// A D1Database look-alike over in-memory bun:sqlite, so the runtime's own
// `drizzle(env.DB, { schema })` queries run for real — the same Drizzle SQL, the same
// relational loading — instead of against a hand-rolled fake. Deliberately not
// `mock.module`: bun applies that process-wide and it would leak into other test files.

// Explicit: the fixture DDL defaults to unixepoch(), which older system SQLite lacks.
const TS = 1_700_000_000;

type Sqlite = ReturnType<typeof createMockDB>["sqlite"];

function d1Over(sqlite: Sqlite) {
  const prepare = (sql: string) => {
    const make = (params: unknown[]) => ({
      bind: (...next: unknown[]) => make(next),
      all: async () => ({ results: sqlite.prepare(sql).all(...(params as never[])), success: true, meta: {} }),
      run: async () => {
        sqlite.prepare(sql).run(...(params as never[]));
        return { results: [], success: true, meta: {} };
      },
      first: async () => sqlite.prepare(sql).get(...(params as never[])) ?? null,
      raw: async () => sqlite.prepare(sql).values(...(params as never[])),
    });
    return make([]);
  };
  return { prepare } as unknown as D1Database;
}

export interface SeedPost {
  id: number;
  alias?: string | null;
  title: string;
  summary?: string;
  content: string;
  draft?: 0 | 1;
  listed?: 0 | 1;
}

/** An env whose D1 binding is a seeded in-memory database. */
export function seededEnv(posts: SeedPost[]): Env {
  const { sqlite } = createMockDB();
  sqlite.exec(`INSERT INTO users (id, username, openid, created_at, updated_at) VALUES (1, 'ruby', 'o1', ${TS}, ${TS})`);
  const insert = sqlite.prepare(
    `INSERT INTO feeds (id, alias, title, summary, content, draft, listed, uid, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ${TS}, ${TS})`,
  );
  for (const p of posts) {
    insert.run(p.id, p.alias ?? null, p.title, p.summary ?? "", p.content, p.draft ?? 0, p.listed ?? 1);
  }
  return createMockEnv({ DB: d1Over(sqlite) });
}

export const blogReq = (path: string, headers?: Record<string, string>) =>
  new Request(`https://blog.food-signals.com${path}`, { headers });
