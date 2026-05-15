/**
 * Achievement + rank system.
 *
 * Achievements and the rank are derived on-the-fly from progress data —
 * no extra storage is required to track unlock state.
 *
 * XP comes from two sources:
 *   1. Solved puzzles, weighted by difficulty
 *   2. Achievement-tier bonuses
 *
 * Rank is purely a label tier based on cumulative XP.
 */

import { metaIndex } from './manifest.js';

const DIFFICULTY_XP = { easy: 5, medium: 15, hard: 30 };
const TIER_XP = { bronze: 10, silver: 25, gold: 50 };

export const RANKS = [
  { key: 'lesefuchs',   label: 'Lesefuchs',     min:   0 },
  { key: 'tinte',       label: 'Tintenkleckser', min:  20 },
  { key: 'feder',       label: 'Federführer',    min:  50 },
  { key: 'setzer',      label: 'Setzer',         min: 100 },
  { key: 'lektor',      label: 'Lektor',         min: 200 },
  { key: 'chef',        label: 'Chefredakteur',  min: 400 },
  { key: 'eminenz',     label: 'Eminenz',        min: 800 },
];

export function rankForXp(xp) {
  let current = RANKS[0];
  for (const r of RANKS) {
    if (xp >= r.min) current = r;
    else break;
  }
  const idx = RANKS.indexOf(current);
  const next = RANKS[idx + 1] || null;
  return {
    key: current.key,
    label: current.label,
    min: current.min,
    xp,
    next: next ? { key: next.key, label: next.label, min: next.min } : null,
    progress: next ? Math.round(100 * (xp - current.min) / (next.min - current.min)) : 100,
  };
}

/**
 * Achievement registry. Each `check(stats)` returns boolean.
 * Add new entries here — UI picks them up automatically.
 */
export const ACHIEVEMENTS = [
  {
    key: 'first_solve',
    name: 'Erste Lösung',
    description: 'Löse dein erstes Rätsel.',
    icon: '★',
    tier: 'bronze',
    check: s => s.solvedCount >= 1,
  },
  {
    key: 'routine',
    name: 'Routine',
    description: 'Löse 5 Rätsel.',
    icon: '✦',
    tier: 'bronze',
    check: s => s.solvedCount >= 5,
  },
  {
    key: 'veteran',
    name: 'Veteran',
    description: 'Löse 10 Rätsel.',
    icon: '✪',
    tier: 'silver',
    check: s => s.solvedCount >= 10,
  },
  {
    key: 'profi',
    name: 'Profi',
    description: 'Löse ein schweres Rätsel.',
    icon: '☆',
    tier: 'silver',
    check: s => s.hardSolvedCount >= 1,
  },
  {
    key: 'perfektionist',
    name: 'Perfektionist',
    description: 'Löse ein Rätsel ohne einen einzigen Hinweis.',
    icon: '◇',
    tier: 'silver',
    check: s => s.noHintSolvedCount >= 1,
  },
  {
    key: 'hardcore_held',
    name: 'Hardcore-Held',
    description: 'Löse ein schweres Rätsel im Hardcore-Modus.',
    icon: '☗',
    tier: 'gold',
    check: s => s.hardcoreHardSolves >= 1,
  },
  {
    key: 'speedrunner',
    name: 'Speedrunner',
    description: 'Löse ein Rätsel in unter 5 Minuten.',
    icon: '⚡',
    tier: 'silver',
    check: s => s.fastestMs > 0 && s.fastestMs < 5 * 60 * 1000,
  },
  {
    key: 'polyglott',
    name: 'Polyglott',
    description: 'Löse Rätsel aus 5 verschiedenen Themen.',
    icon: '✸',
    tier: 'silver',
    check: s => s.distinctThemesSolved >= 5,
  },
  {
    key: 'marathon_geist',
    name: 'Marathon-Geist',
    description: 'Eine Stunde Gesamtspielzeit.',
    icon: '⏱',
    tier: 'gold',
    check: s => s.totalPlayMs >= 60 * 60 * 1000,
  },
  {
    key: 'nachteule',
    name: 'Nachteule',
    description: 'Löse ein Rätsel zwischen 0:00 und 6:00 Uhr.',
    icon: '☾',
    tier: 'bronze',
    check: s => s.nightSolves >= 1,
  },
  {
    key: 'buecherwurm',
    name: 'Bücherwurm',
    description: 'Löse mindestens ein Rätsel in jedem Thema.',
    icon: '✿',
    tier: 'gold',
    check: s => s.themesCoveredCount > 0 && s.themesCoveredCount === s.totalThemesCount,
  },
  {
    key: 'bibliothekar',
    name: 'Bibliothekar',
    description: 'Löse jedes verfügbare Rätsel.',
    icon: '✦',
    tier: 'gold',
    check: s => s.solvedCount > 0 && s.solvedCount === s.totalPuzzleCount,
  },
];

/**
 * Day-streak: count consecutive days (UTC) up to today with at least one solve.
 */
export function computeStreak(solvedRows) {
  if (!solvedRows.length) return { current: 0, longest: 0 };
  const dayKeys = new Set();
  for (const row of solvedRows) {
    if (!row.solved_at) continue;
    const d = new Date(row.solved_at * 1000);
    dayKeys.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
  }
  if (!dayKeys.size) return { current: 0, longest: 0 };

  const today = new Date();
  let cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  let current = 0;
  while (true) {
    const k = `${cursor.getUTCFullYear()}-${cursor.getUTCMonth()}-${cursor.getUTCDate()}`;
    if (dayKeys.has(k)) {
      current++;
      cursor = new Date(cursor.getTime() - 86400000);
    } else if (current === 0) {
      // Allow yesterday-only streak (today not yet solved is still a "live" streak).
      const yesterday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - 86400000);
      const yk = `${yesterday.getUTCFullYear()}-${yesterday.getUTCMonth()}-${yesterday.getUTCDate()}`;
      if (k === `${today.getUTCFullYear()}-${today.getUTCMonth()}-${today.getUTCDate()}` && dayKeys.has(yk)) {
        cursor = yesterday;
        continue;
      }
      break;
    } else {
      break;
    }
  }

  // Longest streak: walk through sorted days.
  const sorted = [...dayKeys].map(k => k.split('-').map(Number)).map(([y, m, d]) => Date.UTC(y, m, d)).sort((a, b) => a - b);
  let longest = 1, run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] === 86400000) {
      run++;
      if (run > longest) longest = run;
    } else if (sorted[i] !== sorted[i - 1]) {
      run = 1;
    }
  }
  return { current, longest };
}

/**
 * Compute stats + XP + unlocked achievements for a user.
 * solvedRows: rows from db.listSolved.all(userId).
 */
export function computeProfile(solvedRows) {
  const meta = metaIndex();
  const allPuzzleIds = [...meta.keys()];
  const allThemes = [...new Set([...meta.values()].map(m => m.theme))];

  // Aggregate solve stats.
  let solvedCount = 0;
  let hardSolvedCount = 0;
  let mediumSolvedCount = 0;
  let easySolvedCount = 0;
  let noHintSolvedCount = 0;
  let hardcoreHardSolves = 0;
  let totalPlayMs = 0;
  let fastestMs = 0;
  let nightSolves = 0;
  const themesSolved = new Set();

  let xpFromPuzzles = 0;

  for (const row of solvedRows) {
    solvedCount++;
    totalPlayMs += row.elapsed_ms || 0;
    if (row.elapsed_ms && (fastestMs === 0 || row.elapsed_ms < fastestMs)) fastestMs = row.elapsed_ms;

    const m = meta.get(row.puzzle_id);
    const diff = m ? m.difficulty : null;
    if (diff === 'easy') { easySolvedCount++; xpFromPuzzles += DIFFICULTY_XP.easy; }
    else if (diff === 'medium') { mediumSolvedCount++; xpFromPuzzles += DIFFICULTY_XP.medium; }
    else if (diff === 'hard') { hardSolvedCount++; xpFromPuzzles += DIFFICULTY_XP.hard; }

    if (row.solved_no_hints) noHintSolvedCount++;
    if (row.solved_in_hardcore && diff === 'hard') hardcoreHardSolves++;
    if (m && m.theme) themesSolved.add(m.theme);

    // Night solve (local time in Berlin would be ideal; we use UTC here for stability)
    if (row.solved_at) {
      const hour = new Date(row.solved_at * 1000).getUTCHours();
      // 22-06 UTC ~ 0-8 CEST/CET, but we'll use 22-04 UTC ≈ 0-6 Berlin time year-round (approx)
      if (hour >= 22 || hour < 4) nightSolves++;
    }
  }

  const stats = {
    solvedCount,
    easySolvedCount,
    mediumSolvedCount,
    hardSolvedCount,
    noHintSolvedCount,
    hardcoreHardSolves,
    totalPlayMs,
    fastestMs,
    nightSolves,
    distinctThemesSolved: themesSolved.size,
    themesCoveredCount: themesSolved.size,
    totalThemesCount: allThemes.length,
    totalPuzzleCount: allPuzzleIds.length,
  };

  // Evaluate achievements and accumulate tier XP.
  let xpFromAchievements = 0;
  const achievements = [];
  for (const def of ACHIEVEMENTS) {
    const unlocked = !!def.check(stats);
    if (unlocked) xpFromAchievements += TIER_XP[def.tier] || 0;
    achievements.push({
      key: def.key,
      name: def.name,
      description: def.description,
      icon: def.icon,
      tier: def.tier,
      tier_xp: TIER_XP[def.tier] || 0,
      unlocked,
    });
  }

  const xp = xpFromPuzzles + xpFromAchievements;
  const rank = rankForXp(xp);
  const streak = computeStreak(solvedRows);

  return { xp, xp_from_puzzles: xpFromPuzzles, xp_from_achievements: xpFromAchievements, rank, achievements, stats, streak };
}

/**
 * Deterministic puzzle-of-the-day selection.
 * Returns puzzleId for today, based on UTC date hash + manifest.
 */
export function dailyPuzzle() {
  const m = metaIndex();
  const ids = [...m.keys()];
  if (!ids.length) return null;
  const today = new Date();
  const yyyymmdd = today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate();
  // simple deterministic hash → index
  let h = yyyymmdd;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  const idx = Math.abs(h) % ids.length;
  return ids[idx];
}
