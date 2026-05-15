/**
 * SQLite schema + statement preparation.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_sub TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    picture TEXT,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    puzzle_id TEXT NOT NULL,
    grid_state TEXT NOT NULL,
    hinted_cells TEXT NOT NULL,
    hint_count INTEGER NOT NULL DEFAULT 0,
    elapsed_ms INTEGER NOT NULL DEFAULT 0,
    solved INTEGER NOT NULL DEFAULT 0,
    solved_at INTEGER,
    updated_at INTEGER NOT NULL,
    percent INTEGER NOT NULL DEFAULT 0,
    hardcore INTEGER NOT NULL DEFAULT 0,
    live_validate INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, puzzle_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_id)`,
];

// In-place migrations for older DBs that pre-date the columns above.
function migrateProgress(db) {
  const cols = db.prepare('PRAGMA table_info(progress)').all().map(r => r.name);
  const missing = (name, sql) => {
    if (!cols.includes(name)) db.prepare(sql).run();
  };
  missing('percent',       'ALTER TABLE progress ADD COLUMN percent INTEGER NOT NULL DEFAULT 0');
  missing('hardcore',      'ALTER TABLE progress ADD COLUMN hardcore INTEGER NOT NULL DEFAULT 0');
  missing('live_validate', 'ALTER TABLE progress ADD COLUMN live_validate INTEGER NOT NULL DEFAULT 0');
}

export function openDb(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  for (const stmt of SCHEMA) db.prepare(stmt).run();
  migrateProgress(db);

  return {
    raw: db,
    upsertUser: db.prepare(`
      INSERT INTO users (google_sub, email, name, picture, created_at, last_seen_at)
      VALUES (@google_sub, @email, @name, @picture, @now, @now)
      ON CONFLICT(google_sub) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        picture = excluded.picture,
        last_seen_at = excluded.last_seen_at
      RETURNING id, google_sub, email, name, picture
    `),
    getUserById: db.prepare(`SELECT id, google_sub, email, name, picture FROM users WHERE id = ?`),
    upsertProgress: db.prepare(`
      INSERT INTO progress (user_id, puzzle_id, grid_state, hinted_cells, hint_count, elapsed_ms, solved, solved_at, updated_at, percent, hardcore, live_validate)
      VALUES (@user_id, @puzzle_id, @grid_state, @hinted_cells, @hint_count, @elapsed_ms, @solved, @solved_at, @now, @percent, @hardcore, @live_validate)
      ON CONFLICT(user_id, puzzle_id) DO UPDATE SET
        grid_state = excluded.grid_state,
        hinted_cells = excluded.hinted_cells,
        hint_count = excluded.hint_count,
        elapsed_ms = excluded.elapsed_ms,
        solved = excluded.solved,
        solved_at = COALESCE(progress.solved_at, excluded.solved_at),
        updated_at = excluded.updated_at,
        percent = excluded.percent,
        hardcore = excluded.hardcore,
        live_validate = excluded.live_validate
    `),
    getProgress: db.prepare(`
      SELECT puzzle_id, grid_state, hinted_cells, hint_count, elapsed_ms, solved, solved_at, updated_at,
             percent, hardcore, live_validate
      FROM progress WHERE user_id = ? AND puzzle_id = ?
    `),
    listProgress: db.prepare(`
      SELECT puzzle_id, hint_count, elapsed_ms, solved, solved_at, updated_at, percent
      FROM progress WHERE user_id = ? ORDER BY updated_at DESC
    `),
  };
}
