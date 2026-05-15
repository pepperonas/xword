/**
 * Database migrations.
 *
 * Each entry has an `id` and an `up(db)` function. Migrations are applied
 * in array order. A `migrations` table tracks applied IDs so a migration
 * never runs twice. Each migration runs inside a transaction so it's
 * either fully applied or rolled back.
 *
 * Add new migrations at the end. NEVER rewrite or reorder existing entries
 * once they have run in production.
 */

export const MIGRATIONS = [
  {
    id: '001-initial-schema',
    up: (db) => {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          google_sub TEXT UNIQUE NOT NULL,
          email TEXT NOT NULL,
          name TEXT,
          picture TEXT,
          created_at INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL
        )
      `).run();
      db.prepare(`
        CREATE TABLE IF NOT EXISTS progress (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          puzzle_id TEXT NOT NULL,
          grid_state TEXT NOT NULL,
          hinted_cells TEXT NOT NULL,
          hint_count INTEGER NOT NULL DEFAULT 0,
          elapsed_ms INTEGER NOT NULL DEFAULT 0,
          solved INTEGER NOT NULL DEFAULT 0,
          solved_at INTEGER,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, puzzle_id)
        )
      `).run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_id)').run();
    },
  },
  {
    id: '002-progress-modes',
    up: (db) => {
      addColumnIfMissing(db, 'progress', 'percent',       'INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(db, 'progress', 'hardcore',      'INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(db, 'progress', 'live_validate', 'INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    id: '003-solve-time-flags',
    up: (db) => {
      addColumnIfMissing(db, 'progress', 'solved_in_hardcore', 'INTEGER');
      addColumnIfMissing(db, 'progress', 'solved_no_hints',    'INTEGER');
    },
  },
];

function addColumnIfMissing(db, table, name, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
  if (!cols.includes(name)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run();
  }
}

/**
 * Apply all pending migrations. Idempotent.
 * @returns {string[]} IDs that were just applied (empty if everything was up to date).
 */
export function runMigrations(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `).run();
  const applied = new Set(db.prepare('SELECT id FROM migrations').all().map(r => r.id));
  const newlyApplied = [];
  const insert = db.prepare('INSERT INTO migrations (id, applied_at) VALUES (?, ?)');

  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    const tx = db.transaction(() => {
      m.up(db);
      insert.run(m.id, Math.floor(Date.now() / 1000));
    });
    tx();
    newlyApplied.push(m.id);
  }
  return newlyApplied;
}
