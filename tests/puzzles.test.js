/**
 * Puzzle-data integrity tests.
 *
 * Catches the structural failure modes the layout suite can't:
 *   - manifest drift (file on disk but not in index.json, or vice versa)
 *   - malformed entries (missing fields, wrong types)
 *   - bad answer strings (lowercase, non-ASCII, too short, with spaces)
 *   - JSON gotcha that bit us once: German typographic quote pattern „…"
 *     where the closer is plain ASCII " — the JSON parser would have
 *     already thrown, but we also scan clue text for the legal-but-risky
 *     mixed-quote pattern that's easy to introduce while editing
 *   - clues that contain the answer verbatim (would give the puzzle away)
 *   - duplicate puzzle IDs across the manifest
 *   - duplicate answers WITHIN a single puzzle
 *   - excessive cross-puzzle reuse of the same answer (a soft cap that
 *     stops a single common word becoming a crutch in every puzzle)
 *
 * Content correctness (right year, right place, right person) is NOT
 * checkable here — that's the 1-Mio-Niveau guardrail in CLAUDE.md.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PUZZLES_DIR = path.join(__dirname, '..', 'puzzles');
const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(PUZZLES_DIR, 'index.json'), 'utf8')
);
const STATS = JSON.parse(
  fs.readFileSync(path.join(PUZZLES_DIR, 'stats.json'), 'utf8')
);

const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const ANSWER_RE = /^[A-Z]{3,}$/;
const ID_RE = /^[a-z]+-(easy|medium|hard)-\d{2}$/;
const REPO_MARKERS = new Set(['index.json', 'stats.json']);

function loadPuzzle(file) {
  return JSON.parse(fs.readFileSync(path.join(PUZZLES_DIR, file), 'utf8'));
}

function listPuzzleFiles() {
  return fs
    .readdirSync(PUZZLES_DIR)
    .filter((f) => f.endsWith('.json') && !REPO_MARKERS.has(f));
}

/* ============================================================
   manifest ↔ filesystem
   ============================================================ */

describe('manifest ↔ filesystem', () => {
  test('every manifest entry has a matching file on disk', () => {
    for (const entry of MANIFEST.puzzles) {
      const p = path.join(PUZZLES_DIR, entry.file);
      assert.ok(fs.existsSync(p), `${entry.file} missing on disk`);
    }
  });

  test('every puzzle file on disk is referenced in the manifest', () => {
    const referenced = new Set(MANIFEST.puzzles.map((p) => p.file));
    for (const file of listPuzzleFiles()) {
      assert.ok(referenced.has(file), `${file} is on disk but not in index.json`);
    }
  });

  test('manifest entries have unique IDs', () => {
    const ids = new Set();
    for (const entry of MANIFEST.puzzles) {
      assert.ok(!ids.has(entry.id), `duplicate id in manifest: ${entry.id}`);
      ids.add(entry.id);
    }
  });

  test('every manifest entry has all required fields', () => {
    for (const entry of MANIFEST.puzzles) {
      for (const k of ['id', 'file', 'title', 'theme', 'difficulty', 'description', 'wordCount', 'size']) {
        assert.ok(
          entry[k] !== undefined && entry[k] !== null && entry[k] !== '',
          `${entry.id || entry.file}: missing manifest field "${k}"`
        );
      }
    }
  });

  test('manifest id matches embedded puzzle id', () => {
    for (const entry of MANIFEST.puzzles) {
      const p = loadPuzzle(entry.file);
      assert.equal(p.id, entry.id, `${entry.file}: id "${p.id}" ≠ manifest "${entry.id}"`);
    }
  });

  test('manifest wordCount matches actual word count', () => {
    for (const entry of MANIFEST.puzzles) {
      const p = loadPuzzle(entry.file);
      assert.equal(
        p.words.length,
        entry.wordCount,
        `${entry.id}: wordCount ${entry.wordCount} ≠ actual ${p.words.length}`
      );
    }
  });

  test('manifest size matches embedded puzzle size', () => {
    for (const entry of MANIFEST.puzzles) {
      const p = loadPuzzle(entry.file);
      if (p.size !== undefined) {
        assert.equal(
          p.size,
          entry.size,
          `${entry.id}: size ${entry.size} ≠ embedded ${p.size}`
        );
      }
    }
  });

  test('manifest title and description match embedded puzzle', () => {
    for (const entry of MANIFEST.puzzles) {
      const p = loadPuzzle(entry.file);
      assert.equal(p.title, entry.title, `${entry.id}: title drift`);
      assert.equal(
        p.description,
        entry.description,
        `${entry.id}: description drift`
      );
    }
  });
});

/* ============================================================
   per-puzzle structural validation
   ============================================================ */

describe('puzzle structural integrity', () => {
  for (const entry of MANIFEST.puzzles) {
    test(`${entry.file} parses and shape-checks`, () => {
      const p = loadPuzzle(entry.file);

      // id format: <theme>-<difficulty>-NN
      assert.match(p.id, ID_RE, `${entry.id}: id format invalid`);
      assert.ok(VALID_DIFFICULTIES.has(p.difficulty), `${entry.id}: invalid difficulty`);
      assert.equal(p.id, `${p.theme}-${p.difficulty}-${p.id.slice(-2)}`,
        `${entry.id}: id parts don't match theme/difficulty fields`);

      // words must be a non-empty array
      assert.ok(Array.isArray(p.words) && p.words.length > 0, `${entry.id}: no words`);

      const seenAnswers = new Set();
      for (const w of p.words) {
        // required fields
        assert.ok(typeof w.answer === 'string' && w.answer.length > 0,
          `${entry.id}: word missing answer`);
        assert.ok(typeof w.clue === 'string' && w.clue.length > 0,
          `${entry.id}/${w.answer}: missing clue`);

        // answer charset
        assert.match(w.answer, ANSWER_RE,
          `${entry.id}/${w.answer}: answers must be A-Z only, ≥3 chars`);

        // no duplicate answers within a single puzzle
        assert.ok(!seenAnswers.has(w.answer),
          `${entry.id}: duplicate answer "${w.answer}" inside one puzzle`);
        seenAnswers.add(w.answer);

        // if layout is baked, row/col/direction must be valid
        if (w.row !== undefined) {
          assert.equal(typeof w.row, 'number', `${entry.id}/${w.answer}: row not numeric`);
          assert.equal(typeof w.col, 'number', `${entry.id}/${w.answer}: col not numeric`);
          assert.ok(['across', 'down'].includes(w.direction),
            `${entry.id}/${w.answer}: direction invalid`);
          assert.ok(w.row >= 0 && w.col >= 0,
            `${entry.id}/${w.answer}: negative coordinate`);
          if (p.size !== undefined) {
            const endR = w.direction === 'down' ? w.row + w.answer.length - 1 : w.row;
            const endC = w.direction === 'across' ? w.col + w.answer.length - 1 : w.col;
            assert.ok(endR < p.size && endC < p.size,
              `${entry.id}/${w.answer}: word extends past grid (size ${p.size})`);
          }
        }
      }
    });
  }
});

/* ============================================================
   clue quality
   ============================================================ */

describe('clue quality', () => {
  test('no clue contains the answer verbatim', () => {
    for (const entry of MANIFEST.puzzles) {
      const p = loadPuzzle(entry.file);
      for (const w of p.words) {
        // Skip clues that intentionally reference the answer in a foreign-word
        // context — none currently, but if added, allow opt-out via "…".
        const haystack = w.clue.toUpperCase();
        assert.ok(
          !haystack.includes(w.answer),
          `${entry.id}/${w.answer}: clue contains the answer ("${w.clue}")`
        );
      }
    }
  });

  test('no clue uses the mixed-quote pattern „…" (Unicode opener + ASCII closer)', () => {
    // The JSON file would already fail to parse if „…" closed with the ASCII
    // double-quote that terminates the string. But the safer pattern is also
    // human-error-prone (typing „ via German keyboard, ASCII " from autocorrect).
    for (const entry of MANIFEST.puzzles) {
      const p = loadPuzzle(entry.file);
      for (const w of p.words) {
        // Unicode U+201E is „ ; if it appears, the closer must also be Unicode (" or ")
        if (w.clue.includes('„')) {
          const openCount = (w.clue.match(/„/g) || []).length;
          const properCloseCount =
            (w.clue.match(/[“”]/g) || []).length;
          assert.ok(
            properCloseCount >= openCount,
            `${entry.id}/${w.answer}: "„" without matching „/" closer in: ${w.clue}`
          );
        }
      }
    }
  });

  test('no clue is suspiciously short (<10 chars)', () => {
    for (const entry of MANIFEST.puzzles) {
      const p = loadPuzzle(entry.file);
      for (const w of p.words) {
        assert.ok(
          w.clue.length >= 10,
          `${entry.id}/${w.answer}: clue suspiciously short (${w.clue.length} chars): "${w.clue}"`
        );
      }
    }
  });

  test('no description is empty or shorter than 20 chars', () => {
    for (const entry of MANIFEST.puzzles) {
      assert.ok(entry.description && entry.description.length >= 20,
        `${entry.id}: description too short`);
    }
  });
});

/* ============================================================
   cross-puzzle answer reuse
   ============================================================ */

describe('cross-puzzle answer reuse', () => {
  test('no answer appears in more than 2 puzzles (soft cap)', () => {
    const appearances = new Map();
    for (const entry of MANIFEST.puzzles) {
      const p = loadPuzzle(entry.file);
      for (const w of p.words) {
        const list = appearances.get(w.answer) || [];
        list.push(entry.id);
        appearances.set(w.answer, list);
      }
    }
    const overused = [];
    for (const [ans, list] of appearances) {
      if (list.length > 2) {
        overused.push(`${ans} → ${list.join(', ')}`);
      }
    }
    assert.equal(
      overused.length,
      0,
      `Answers appearing in >2 puzzles (soft cap):\n  ${overused.join('\n  ')}`
    );
  });
});

/* ============================================================
   stats.json freshness
   ============================================================ */

describe('puzzles/stats.json reflects current manifest', () => {
  test('total matches manifest', () => {
    assert.equal(STATS.total, MANIFEST.puzzles.length,
      'stats.json out of date — rerun `npm run stats:bump`');
  });

  test('byDifficulty totals match', () => {
    const counts = { easy: 0, medium: 0, hard: 0 };
    for (const p of MANIFEST.puzzles) counts[p.difficulty]++;
    assert.deepEqual(STATS.byDifficulty, counts,
      'stats.json byDifficulty drift — rerun `npm run stats:bump`');
  });

  test('byTheme totals match', () => {
    const counts = {};
    for (const p of MANIFEST.puzzles) counts[p.theme] = (counts[p.theme] || 0) + 1;
    assert.deepEqual(STATS.byTheme, counts,
      'stats.json byTheme drift — rerun `npm run stats:bump`');
  });

  test('themes count matches unique theme count', () => {
    const unique = new Set(MANIFEST.puzzles.map((p) => p.theme));
    assert.equal(STATS.themes, unique.size,
      'stats.json themes count drift — rerun `npm run stats:bump`');
  });

  test('wordsTotal matches manifest wordCount sum', () => {
    const sum = MANIFEST.puzzles.reduce((s, p) => s + (p.wordCount || 0), 0);
    assert.equal(STATS.wordsTotal, sum,
      'stats.json wordsTotal drift — rerun `npm run stats:bump`');
  });
});
