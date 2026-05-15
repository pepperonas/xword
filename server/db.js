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

    /* ---------- Admin queries ---------- */
    adminListUsers: db.prepare(`
      SELECT u.id, u.email, u.name, u.picture, u.created_at, u.last_seen_at,
             COUNT(p.puzzle_id) AS puzzles_attempted,
             COALESCE(SUM(p.solved), 0) AS puzzles_solved,
             COALESCE(SUM(p.elapsed_ms), 0) AS total_time_ms,
             COALESCE(SUM(p.hint_count), 0) AS total_hints
      FROM users u
      LEFT JOIN progress p ON p.user_id = u.id
      GROUP BY u.id
      ORDER BY u.last_seen_at DESC
    `),
    adminGlobalStats: db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM progress) AS total_progress,
        (SELECT COUNT(*) FROM progress WHERE solved = 1) AS total_solved,
        (SELECT COALESCE(SUM(elapsed_ms), 0) FROM progress) AS total_time_ms,
        (SELECT COALESCE(SUM(hint_count), 0) FROM progress) AS total_hints,
        (SELECT COUNT(*) FROM users WHERE last_seen_at > ?) AS active_users_7d
    `),
    adminRecentActivity: db.prepare(`
      SELECT p.user_id, p.puzzle_id, p.percent, p.solved, p.elapsed_ms,
             p.hint_count, p.updated_at,
             u.email, u.name, u.picture
      FROM progress p
      JOIN users u ON u.id = p.user_id
      ORDER BY p.updated_at DESC
      LIMIT 100
    `),
    adminPuzzleStats: db.prepare(`
      SELECT puzzle_id,
             COUNT(*) AS attempts,
             COALESCE(SUM(solved), 0) AS solves,
             ROUND(AVG(elapsed_ms)) AS avg_time_ms,
             ROUND(AVG(percent)) AS avg_percent,
             ROUND(AVG(hint_count), 1) AS avg_hints,
             MIN(CASE WHEN solved = 1 THEN elapsed_ms END) AS best_time_ms
      FROM progress
      GROUP BY puzzle_id
      ORDER BY attempts DESC
    `),
  };
}
