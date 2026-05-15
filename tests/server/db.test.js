/**
 * Tests for server/db.js — schema migrations, upsert behavior.
 * Uses an in-memory SQLite DB for hermetic tests.
 */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

async function loadDb() {
  return await import(path.join('..', '..', 'server', 'db.js'));
}

function createUser(db, sub = 'sub-123', email = 'u@example.com') {
  const now = Math.floor(Date.now() / 1000);
  return db.upsertUser.get({
    google_sub: sub,
    email,
    name: 'Test User',
    picture: null,
    now,
  });
}

describe('db migrations', () => {
  test('opens a fresh in-memory DB and creates all tables', async () => {
    const { openDb } = await loadDb();
    const db = openDb(':memory:');
    const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
    assert.ok(tables.includes('users'));
    assert.ok(tables.includes('progress'));
    assert.ok(tables.includes('migrations'));
  });

  test('progress table has all expected columns after migrations', async () => {
    const { openDb } = await loadDb();
    const db = openDb(':memory:');
    const cols = db.raw.prepare('PRAGMA table_info(progress)').all().map(r => r.name);
    for (const c of ['user_id', 'puzzle_id', 'grid_state', 'hinted_cells', 'hint_count',
                     'elapsed_ms', 'solved', 'solved_at', 'updated_at',
                     'percent', 'hardcore', 'live_validate',
                     'solved_in_hardcore', 'solved_no_hints']) {
      assert.ok(cols.includes(c), `column ${c} present`);
    }
  });

  test('migrations are idempotent (running on existing DB applies nothing new)', async () => {
    const { openDb } = await loadDb();
    const { runMigrations } = await import(path.join('..', '..', 'server', 'migrations.js'));
    const db = openDb(':memory:');
    const second = runMigrations(db.raw);
    assert.deepEqual(second, [], 'second run applies no migrations');
  });
});

describe('upsert behaviour', () => {
  test('upsertProgress preserves solved_in_hardcore on subsequent saves', async () => {
    const { openDb } = await loadDb();
    const db = openDb(':memory:');
    const user = createUser(db);
    const now = Math.floor(Date.now() / 1000);

    // First save: solved while in hardcore mode
    db.upsertProgress.run({
      user_id: user.id, puzzle_id: 'p1',
      grid_state: '{}', hinted_cells: '[]',
      hint_count: 0, elapsed_ms: 1000,
      solved: 1, solved_at: now, now,
      percent: 100, hardcore: 1, live_validate: 0,
    });
    let row = db.getProgress.get(user.id, 'p1');
    assert.equal(row.hardcore, 1);

    // Second save: hardcore toggled off (e.g. user inspected the result without hardcore)
    db.upsertProgress.run({
      user_id: user.id, puzzle_id: 'p1',
      grid_state: '{}', hinted_cells: '[]',
      hint_count: 0, elapsed_ms: 1100,
      solved: 1, solved_at: now, now: now + 60,
      percent: 100, hardcore: 0, live_validate: 0,
    });
    row = db.getProgress.get(user.id, 'p1');
    assert.equal(row.hardcore, 0, 'current hardcore flag updates');
    // solved_in_hardcore must remain 1 — captured at first solve
    const raw = db.raw.prepare('SELECT solved_in_hardcore FROM progress WHERE user_id = ? AND puzzle_id = ?').get(user.id, 'p1');
    assert.equal(raw.solved_in_hardcore, 1, 'solved_in_hardcore is preserved');
  });

  test('upsertProgress preserves solved_at across updates', async () => {
    const { openDb } = await loadDb();
    const db = openDb(':memory:');
    const user = createUser(db);
    const firstNow = 1700000000;

    db.upsertProgress.run({
      user_id: user.id, puzzle_id: 'p2',
      grid_state: '{}', hinted_cells: '[]',
      hint_count: 0, elapsed_ms: 500,
      solved: 1, solved_at: firstNow, now: firstNow,
      percent: 100, hardcore: 0, live_validate: 0,
    });
    db.upsertProgress.run({
      user_id: user.id, puzzle_id: 'p2',
      grid_state: '{}', hinted_cells: '[]',
      hint_count: 0, elapsed_ms: 600,
      solved: 1, solved_at: firstNow + 9999, now: firstNow + 9999,
      percent: 100, hardcore: 0, live_validate: 0,
    });
    const row = db.getProgress.get(user.id, 'p2');
    assert.equal(row.solved_at, firstNow, 'solved_at is captured once');
  });

  test('upsertUser is idempotent on google_sub conflict', async () => {
    const { openDb } = await loadDb();
    const db = openDb(':memory:');
    const a = createUser(db, 'same-sub', 'first@example.com');
    const b = createUser(db, 'same-sub', 'changed@example.com');
    assert.equal(a.id, b.id, 'same user-id returned on conflict');
    assert.equal(b.email, 'changed@example.com', 'email gets updated');
  });

  test('CASCADE delete: removing user deletes their progress rows', async () => {
    const { openDb } = await loadDb();
    const db = openDb(':memory:');
    const user = createUser(db);
    db.upsertProgress.run({
      user_id: user.id, puzzle_id: 'p3',
      grid_state: '{}', hinted_cells: '[]',
      hint_count: 0, elapsed_ms: 1, solved: 0,
      solved_at: null, now: 1, percent: 0, hardcore: 0, live_validate: 0,
    });
    assert.equal(db.listProgress.all(user.id).length, 1);
    db.raw.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    assert.equal(db.listProgress.all(user.id).length, 0, 'progress cascaded out');
  });
});
