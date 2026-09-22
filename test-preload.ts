// Bun on macOS links against the system libsqlite3. macOS 12 ships SQLite 3.37,
// which predates unixepoch() (added in 3.38) — a default this schema uses in
// tests/fixtures, so every DB-backed test fails with "no such function: unixepoch".
//
// Point bun:sqlite at a newer libsqlite3 when one is present (Homebrew). This MUST
// run before any Database is constructed — including any probe of our own, since
// opening a database locks in the current library. Hence: no version check, just an
// existence check. A no-op where Homebrew SQLite isn't installed.
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

const CANDIDATES = [
  "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib",
  "/usr/local/opt/sqlite/lib/libsqlite3.dylib",
];

if (process.platform === "darwin") {
  for (const path of CANDIDATES) {
    if (!existsSync(path)) continue;
    try {
      Database.setCustomSQLite(path);
    } catch {
      // Already opened a DB, or the library is unusable — keep the default.
    }
    break;
  }
}
