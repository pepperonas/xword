/**
 * Tests for server/achievements.js — rank ladder, achievement evaluation, streak.
 */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

async function loadAchievements() {
  return await import(path.join('..', '..', 'server', 'achievements.js'));
}

function solvedRow(opts = {}) {
  return {
    puzzle_id: opts.puzzle_id || 'tech-easy-01',
    elapsed_ms: opts.elapsed_ms ?? 300000,
    hint_count: opts.hint_count ?? 0,
    solved_at: opts.solved_at ?? 1700000000,
    solved_in_hardcore: opts.solved_in_hardcore ?? 0,
    solved_no_hints: opts.solved_no_hints ?? 1,
  };
}

describe('rankForXp', () => {
  test('starts at Lesefuchs with 0 XP', async () => {
    const { rankForXp } = await loadAchievements();
    const r = rankForXp(0);
    assert.equal(r.label, 'Lesefuchs');
    assert.equal(r.min, 0);
    assert.equal(r.progress, 0);
    assert.equal(r.next.label, 'Tintenkleckser');
  });

  test('crosses thresholds at the right XP', async () => {
    const { rankForXp } = await loadAchievements();
    assert.equal(rankForXp(19).label,  'Lesefuchs');
    assert.equal(rankForXp(20).label,  'Tintenkleckser');
    assert.equal(rankForXp(50).label,  'Federführer');
    assert.equal(rankForXp(100).label, 'Setzer');
    assert.equal(rankForXp(200).label, 'Lektor');
    assert.equal(rankForXp(400).label, 'Chefredakteur');
    assert.equal(rankForXp(800).label, 'Eminenz');
    assert.equal(rankForXp(9999).label, 'Eminenz');
  });

  test('top rank has no next and 100% progress', async () => {
    const { rankForXp } = await loadAchievements();
    const r = rankForXp(1000);
    assert.equal(r.next, null);
    assert.equal(r.progress, 100);
  });

  test('progress is the percent-fill toward the next rank', async () => {
    const { rankForXp } = await loadAchievements();
    // 100 = Setzer (100), 200 = Lektor. At XP 150 → 50% to next.
    const r = rankForXp(150);
    assert.equal(r.label, 'Setzer');
    assert.equal(r.progress, 50);
  });
});

describe('computeProfile', () => {
  test('empty solves: still produces a Lesefuchs profile', async () => {
    const { computeProfile } = await loadAchievements();
    const p = computeProfile([]);
    assert.equal(p.xp, 0);
    assert.equal(p.rank.label, 'Lesefuchs');
    assert.equal(p.achievements.find(a => a.key === 'first_solve').unlocked, false);
    assert.equal(p.stats.solvedCount, 0);
  });

  test('one solve unlocks first_solve and grants 10 + base XP', async () => {
    const { computeProfile } = await loadAchievements();
    const p = computeProfile([solvedRow({ hint_count: 1, solved_no_hints: 0 })]);
    // base XP depends on manifest (likely 0 in test env), but first_solve bonus is 10
    const first = p.achievements.find(a => a.key === 'first_solve');
    assert.equal(first.unlocked, true);
    assert.ok(p.xp >= 10, 'first_solve bonus counted');
  });

  test('speedrunner unlocks on a sub-5-minute solve', async () => {
    const { computeProfile } = await loadAchievements();
    const p = computeProfile([solvedRow({ elapsed_ms: 4 * 60 * 1000 })]);
    const a = p.achievements.find(x => x.key === 'speedrunner');
    assert.equal(a.unlocked, true);
  });

  test('perfektionist requires solved_no_hints flag', async () => {
    const { computeProfile } = await loadAchievements();
    const withFlag = computeProfile([solvedRow({ solved_no_hints: 1 })]);
    const withoutFlag = computeProfile([solvedRow({ solved_no_hints: 0 })]);
    assert.equal(withFlag.achievements.find(a => a.key === 'perfektionist').unlocked, true);
    assert.equal(withoutFlag.achievements.find(a => a.key === 'perfektionist').unlocked, false);
  });

  test('routine and veteran are progressive (5 / 10 solves)', async () => {
    const { computeProfile } = await loadAchievements();
    const four  = computeProfile(Array(4).fill(0).map(() => solvedRow()));
    const five  = computeProfile(Array(5).fill(0).map(() => solvedRow()));
    const ten   = computeProfile(Array(10).fill(0).map(() => solvedRow()));
    assert.equal(four.achievements.find(a => a.key === 'routine').unlocked, false);
    assert.equal(five.achievements.find(a => a.key === 'routine').unlocked, true);
    assert.equal(five.achievements.find(a => a.key === 'veteran').unlocked, false);
    assert.equal(ten.achievements.find(a => a.key === 'veteran').unlocked, true);
  });

  test('marathon_geist needs 1h total play time', async () => {
    const { computeProfile } = await loadAchievements();
    // 6 × 10 min = 1h
    const rows = Array(6).fill(0).map(() => solvedRow({ elapsed_ms: 10 * 60 * 1000 }));
    const p = computeProfile(rows);
    assert.equal(p.achievements.find(a => a.key === 'marathon_geist').unlocked, true);
  });
});

describe('computeStreak', () => {
  test('empty input returns 0/0', async () => {
    const { computeStreak } = await loadAchievements();
    const s = computeStreak([]);
    assert.deepEqual(s, { current: 0, longest: 0 });
  });

  test('single solve today gives current=1, longest=1', async () => {
    const { computeStreak } = await loadAchievements();
    const today = Math.floor(Date.now() / 1000);
    const s = computeStreak([solvedRow({ solved_at: today })]);
    assert.ok(s.current >= 1);
    assert.equal(s.longest, 1);
  });

  test('two consecutive days = streak of 2', async () => {
    const { computeStreak } = await loadAchievements();
    const today = Math.floor(Date.now() / 1000);
    const yesterday = today - 86400;
    const s = computeStreak([
      solvedRow({ solved_at: yesterday, puzzle_id: 'a' }),
      solvedRow({ solved_at: today,     puzzle_id: 'b' }),
    ]);
    assert.equal(s.current, 2);
    assert.equal(s.longest, 2);
  });

  test('gap breaks the streak', async () => {
    const { computeStreak } = await loadAchievements();
    const today = Math.floor(Date.now() / 1000);
    const twoDaysAgo = today - 2 * 86400;
    const s = computeStreak([
      solvedRow({ solved_at: twoDaysAgo, puzzle_id: 'a' }),
      solvedRow({ solved_at: today,      puzzle_id: 'b' }),
    ]);
    assert.equal(s.current, 1, 'only today counts');
  });

  test('longest streak survives even after a gap', async () => {
    const { computeStreak } = await loadAchievements();
    const day = 86400;
    // 3 consecutive days long ago, then nothing, then 1 day today
    const ancient = 1600000000;
    const rows = [
      solvedRow({ solved_at: ancient,           puzzle_id: 'a' }),
      solvedRow({ solved_at: ancient + day,     puzzle_id: 'b' }),
      solvedRow({ solved_at: ancient + 2 * day, puzzle_id: 'c' }),
      solvedRow({ solved_at: Math.floor(Date.now() / 1000), puzzle_id: 'd' }),
    ];
    const s = computeStreak(rows);
    assert.equal(s.longest, 3, 'historical run preserved');
  });
});

describe('dailyPuzzle', () => {
  test('returns null when manifest is empty, otherwise a string id', async () => {
    const { dailyPuzzle } = await loadAchievements();
    const id = dailyPuzzle();
    // In the test env the manifest may load from candidate paths or be empty.
    if (id !== null) assert.equal(typeof id, 'string');
  });
});
