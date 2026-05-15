/**
 * Puzzle manifest loader with a small TTL cache.
 *
 * The achievement system needs to know each puzzle's theme and difficulty.
 * We read the manifest file written by the web frontend (puzzles/index.json).
 */
import { readFileSync } from 'node:fs';

const TTL_MS = 60_000; // refresh once a minute
let cache = null;
let cachedAt = 0;

function candidatePaths() {
  const paths = [];
  if (process.env.MANIFEST_PATH) paths.push(process.env.MANIFEST_PATH);
  paths.push('/var/www/xword.celox.io/puzzles/index.json');
  paths.push('../puzzles/index.json');
  paths.push('./puzzles/index.json');
  return paths;
}

export function loadManifest(forceReload = false) {
  if (!forceReload && cache && (Date.now() - cachedAt) < TTL_MS) return cache;
  for (const path of candidatePaths()) {
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      cache = data;
      cachedAt = Date.now();
      return cache;
    } catch { /* try next */ }
  }
  if (!cache) {
    console.warn('[manifest] no manifest found in any candidate path');
    cache = { puzzles: [] };
  }
  return cache;
}

/** Returns Map<puzzleId, { difficulty, theme }>. */
export function metaIndex() {
  const m = loadManifest();
  const map = new Map();
  for (const p of (m.puzzles || [])) {
    map.set(p.id, { difficulty: p.difficulty, theme: p.theme, title: p.title });
  }
  return map;
}
