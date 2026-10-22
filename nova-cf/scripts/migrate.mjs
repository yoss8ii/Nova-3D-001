/**
 * scripts/migrate.mjs - applies the SQL files of migrations/ to your database
 *
 *   DATABASE_URL="postgres://user:password@host:5432/db" npm run migrate
 *
 * Each file runs once, in alphabetical order, inside a transaction. Applied files are listed in the
 * table schema_migrations, so running the command again only applies NEW files.
 * Works with any Postgres (Supabase, Neon, local...). Run it again after adding a migration.
 */
import pg from "pg"
import { readdir, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { join, dirname } from "node:path"

const raw = process.env.DATABASE_URL
if (!raw) { console.error('Set DATABASE_URL first, e.g.  DATABASE_URL="postgres://..." npm run migrate'); process.exit(1) }

// We choose TLS ourselves: remove sslmode from the URL, then enable TLS for non-local databases
const url = new URL(raw); url.searchParams.delete("sslmode")
const local = ["localhost", "127.0.0.1"].includes(url.hostname)
const db = new pg.Client({ connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: false } })

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations")
await db.connect()
try {
  await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())")
  const done = new Set((await db.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name))
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()
  let n = 0
  for (const f of files) {
    if (done.has(f)) continue
    console.log("Applying", f)
    await db.query("BEGIN")
    try {
      await db.query(await readFile(join(dir, f), "utf8"))
      await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f])
      await db.query("COMMIT")
      n++
    } catch (e) { await db.query("ROLLBACK"); throw e }
  }
  console.log(n ? `Done: ${n} migration(s) applied.` : "Database already up to date.")
} finally { await db.end() }
