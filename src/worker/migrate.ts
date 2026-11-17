/**
 * Hoplane: application-managed D1 migrations.
 * https://kitgenix.com · https://github.com/Kitgenix/hoplane
 *
 * Each Worker isolate checks the database once and remembers a successful
 * result. D1 stores applied filenames in the same `d1_migrations` table used
 * by Wrangler. New migrations must use new numbered filenames; never edit an
 * already-applied migration to modify an existing production database.
 *
 * D1.batch() executes a migration's statements and marker in one transaction.
 * Runtime-first migration still requires a multi-isolate deployment test.
 */
const files = import.meta.glob('../../migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const MIGRATIONS = Object.entries(files)
  .map(([path, sql]) => ({ name: path.split('/').pop()!, sql }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Split ordinary SQLite DDL/DML statements without treating semicolons or
 * comment markers inside quoted strings as SQL separators.
 *
 * This parser does NOT support compound CREATE TRIGGER bodies. If a future
 * migration requires triggers, use a D1-compatible migration runner instead
 * of extending this splitter by simple string replacement.
 */
export function splitSql(sql: string): string[] {
  type Mode = 'sql' | 'single' | 'double' | 'backtick' | 'bracket' | 'line-comment' | 'block-comment';
  let mode: Mode = 'sql';
  let statement = '';
  const result: string[] = [];

  const push = () => {
    const trimmed = statement.trim();
    if (trimmed) result.push(trimmed);
    statement = '';
  };

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (mode === 'line-comment') {
      if (ch === '\n') {
        statement += '\n';
        mode = 'sql';
      }
      continue;
    }
    if (mode === 'block-comment') {
      if (ch === '*' && next === '/') {
        i++;
        mode = 'sql';
        statement += ' ';
      }
      continue;
    }
    if (mode !== 'sql') {
      statement += ch;
      const closing = mode === 'single' ? "'" : mode === 'double' ? '"' : mode === 'backtick' ? '`' : ']';
      if (ch === closing) {
        // SQLite escapes quote marks by doubling them within a literal.
        if (next === closing && mode !== 'bracket') {
          statement += next;
          i++;
        } else {
          mode = 'sql';
        }
      }
      continue;
    }

    if (ch === '-' && next === '-') {
      mode = 'line-comment';
      i++;
    } else if (ch === '/' && next === '*') {
      mode = 'block-comment';
      i++;
    } else if (ch === "'") {
      statement += ch;
      mode = 'single';
    } else if (ch === '"') {
      statement += ch;
      mode = 'double';
    } else if (ch === '`') {
      statement += ch;
      mode = 'backtick';
    } else if (ch === '[') {
      statement += ch;
      mode = 'bracket';
    } else if (ch === ';') {
      push();
    } else {
      statement += ch;
    }
  }

  if (mode !== 'sql' && mode !== 'line-comment') {
    throw new Error(`Unterminated SQL string or comment in migration (${mode}).`);
  }
  push();
  return result;
}

let ready: Promise<void> | null = null;

export function ensureSchema(db: D1Database): Promise<void> {
  if (!ready) {
    ready = migrate(db).catch((err) => {
      ready = null; // Allow a later request to retry a failed initialization.
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
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  ).run();

  const { results } = await db.prepare('SELECT name FROM d1_migrations').all<{ name: string }>();
  const applied = new Set(results.map((row) => row.name));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;

    const statements = splitSql(migration.sql).map((sql) => db.prepare(sql));
    statements.push(db.prepare('INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)').bind(migration.name));

    try {
      await db.batch(statements);
    } catch (err) {
      // Another isolate may have committed the same migration first.
      // Never suppress an error unless that migration's marker now exists.
      const row = await db.prepare('SELECT 1 FROM d1_migrations WHERE name = ?')
        .bind(migration.name)
        .first();
      if (!row) throw err;
    }
  }
}
