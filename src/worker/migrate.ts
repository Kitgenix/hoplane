/**
 * Runtime migrations: the schema in /migrations is applied automatically the
 * first time each Worker isolate touches the database. This means a fresh fork
 * works right after `wrangler deploy` or the Deploy button, with no extra step.
 *
 * Uses the same `d1_migrations` table as `wrangler d1 migrations apply`, so
 * both methods can be mixed safely.
 */
const files = import.meta.glob('../../migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const MIGRATIONS = Object.entries(files)
  .map(([path, sql]) => ({ name: path.split('/').pop()!, sql }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function splitSql(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

let ready: Promise<void> | null = null;

export function ensureSchema(db: D1Database): Promise<void> {
  if (!ready) {
    ready = migrate(db).catch((err) => {
      ready = null; // retry on the next request
      throw err;
    });
  }
  return ready;
}

/** Testing hook. */
export function resetSchemaCache() {
  ready = null;
}

async function migrate(db: D1Database) {
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    )
    .run();
  const { results } = await db.prepare('SELECT name FROM d1_migrations').all<{ name: string }>();
  const applied = new Set(results.map((r) => r.name));
  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    const statements = splitSql(m.sql).map((s) => db.prepare(s));
    statements.push(db.prepare('INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)').bind(m.name));
    try {
      await db.batch(statements);
    } catch (err) {
      // Another isolate may have applied it at the same moment.
      const row = await db.prepare('SELECT 1 FROM d1_migrations WHERE name = ?').bind(m.name).first();
      if (!row) throw err;
    }
  }
}
