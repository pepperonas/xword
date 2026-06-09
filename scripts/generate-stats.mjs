#!/usr/bin/env node
// Generates puzzles/stats.json from the manifest.
// Committed alongside source so shields.io dynamic badges can fetch it via
// raw.githubusercontent.com. Re-run on every build via scripts/build.sh.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(ROOT, 'puzzles/index.json');
const outPath = resolve(ROOT, 'puzzles/stats.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const puzzles = manifest.puzzles;

const byDifficulty = { easy: 0, medium: 0, hard: 0 };
const byTheme = {};
let wordsTotal = 0;

for (const p of puzzles) {
  byDifficulty[p.difficulty] = (byDifficulty[p.difficulty] || 0) + 1;
  byTheme[p.theme] = (byTheme[p.theme] || 0) + 1;
  wordsTotal += p.wordCount || 0;
}

const stats = {
  total: puzzles.length,
  themes: Object.keys(byTheme).length,
  wordsTotal,
  byDifficulty,
  byTheme,
};

writeFileSync(outPath, JSON.stringify(stats, null, 2) + '\n');
console.log(
  `stats.json → ${stats.total} puzzles, ${stats.themes} themes, ` +
  `${stats.byDifficulty.easy}/${stats.byDifficulty.medium}/${stats.byDifficulty.hard} (easy/med/hard), ` +
  `${stats.wordsTotal} words`
);
