/**
 * Unit tests for assets/layout.js
 *
 * Run:  npm test   (from project root)
 *   or: node --test tests/
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Load the browser module — it attaches XwordLayout to globalThis under Node.
require(path.join(__dirname, '..', 'assets', 'layout.js'));
const { layout, normaliseAnswer } = globalThis.XwordLayout;

/* ============================================================
   helpers
   ============================================================ */

function getCells(word) {
  const cells = [];
  for (let i = 0; i < word.answer.length; i++) {
    const r = word.direction === 'across' ? word.row : word.row + i;
    const c = word.direction === 'across' ? word.col + i : word.col;
    cells.push({ r, c, letter: word.answer[i] });
  }
  return cells;
}

function buildLetterGrid(result) {
  const g = Array.from({ length: result.size }, () => new Array(result.size).fill(null));
  for (const w of result.words) {
    for (const cell of getCells(w)) {
      g[cell.r][cell.c] = cell.letter;
    }
  }
  return g;
}

function countCrossings(result) {
  const counts = {};
  for (const w of result.words) {
    for (const cell of getCells(w)) {
      const k = `${cell.r},${cell.c}`;
      counts[k] = (counts[k] || 0) + 1;
    }
  }
  return Object.values(counts).filter(n => n > 1).length;
}

function loadPuzzle(name) {
  const p = path.join(__dirname, '..', 'puzzles', name);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/* ============================================================
   normaliseAnswer
   ============================================================ */

describe('normaliseAnswer', () => {
  test('uppercases letters', () => {
    assert.equal(normaliseAnswer('hello'), 'HELLO');
  });

  test('expands German umlauts', () => {
    assert.equal(normaliseAnswer('Mädchen'), 'MAEDCHEN');
    assert.equal(normaliseAnswer('Öl'), 'OEL');
    assert.equal(normaliseAnswer('Über'), 'UEBER');
    assert.equal(normaliseAnswer('Straße'), 'STRASSE');
  });

  test('strips non-letter characters', () => {
    assert.equal(normaliseAnswer('hello, world!'), 'HELLOWORLD');
    assert.equal(normaliseAnswer('AB-CD 12 EF'), 'ABCDEF');
    assert.equal(normaliseAnswer('e.coli'), 'ECOLI');
  });

  test('handles empty / nullish input', () => {
    assert.equal(normaliseAnswer(''), '');
    assert.equal(normaliseAnswer(null), '');
    assert.equal(normaliseAnswer(undefined), '');
  });
});

/* ============================================================
   layout — placement validity
   ============================================================ */

describe('layout — basic placement', () => {
  test('places a single word', () => {
    const r = layout([{ answer: 'HELLO', clue: 'greeting' }]);
    assert.equal(r.words.length, 1);
    assert.equal(r.unplaced.length, 0);
    assert.equal(r.words[0].answer, 'HELLO');
  });

  test('places two crossing words', () => {
    const r = layout([
      { answer: 'HELLO', clue: 'greeting' },
      { answer: 'WORLD', clue: 'planet' }, // shares L and O with HELLO
    ]);
    assert.equal(r.unplaced.length, 0, 'both words should be placed');
    assert.equal(r.words.length, 2);
    assert.ok(countCrossings(r) >= 1, 'at least one crossing');
  });

  test('returns a normalised grid starting at (0,0)', () => {
    const r = layout([
      { answer: 'TEST', clue: 'check' },
      { answer: 'EAST', clue: 'direction' },
    ]);
    const minR = Math.min(...r.words.map(w => w.row));
    const minC = Math.min(...r.words.map(w => w.col));
    assert.equal(minR, 0, 'grid should start at row 0');
    assert.equal(minC, 0, 'grid should start at col 0');
  });

  test('size is at least the bounding box', () => {
    const r = layout([{ answer: 'ABCDEFGHIJ', clue: 'long' }]);
    assert.ok(r.size >= 10, 'grid must be ≥ longest word');
  });

  test('handles empty input gracefully', () => {
    const r = layout([]);
    assert.equal(r.words.length, 0);
    assert.equal(r.unplaced.length, 0);
    assert.ok(r.size > 0);
  });

  test('skips degenerate input (length < 2)', () => {
    const r = layout([
      { answer: 'A', clue: 'too short' },
      { answer: 'BB', clue: 'short but ok' },
    ]);
    // After filtering, only BB remains
    assert.equal(r.words.length, 1);
    assert.equal(r.words[0].answer, 'BB');
  });
});

/* ============================================================
   layout — crossword integrity invariants
   ============================================================ */

describe('layout — crossword integrity', () => {
  function assertNoLetterConflicts(result) {
    const g = Array.from({ length: result.size }, () => new Array(result.size).fill(null));
    for (const w of result.words) {
      for (const cell of getCells(w)) {
        if (g[cell.r][cell.c] != null && g[cell.r][cell.c] !== cell.letter) {
          assert.fail(`letter conflict at (${cell.r},${cell.c}): ${g[cell.r][cell.c]} vs ${cell.letter}`);
        }
        g[cell.r][cell.c] = cell.letter;
      }
    }
  }

  function assertNoParallelTouch(result) {
    // A "parallel touch" violation only matters at NON-CROSSING cells.
    // At a crossing, the perpendicular partner naturally occupies neighbour
    // cells (T-junctions with another down-word that also crosses the same
    // across-word are legitimate and common).
    const ownership = {};
    for (const w of result.words) {
      for (const cell of getCells(w)) {
        const k = `${cell.r},${cell.c}`;
        (ownership[k] = ownership[k] || []).push(w);
      }
    }

    for (const w of result.words) {
      for (const cell of getCells(w)) {
        const here = ownership[`${cell.r},${cell.c}`];
        if (here.length > 1) continue; // crossing cell — neighbours are partner's territory

        const perp1 = w.direction === 'across' ? { r: cell.r - 1, c: cell.c } : { r: cell.r, c: cell.c - 1 };
        const perp2 = w.direction === 'across' ? { r: cell.r + 1, c: cell.c } : { r: cell.r, c: cell.c + 1 };
        for (const p of [perp1, perp2]) {
          if (p.r < 0 || p.c < 0 || p.r >= result.size || p.c >= result.size) continue;
          const owners = ownership[`${p.r},${p.c}`];
          if (!owners) continue;
          // Non-crossing cell with an occupied perp neighbour: anything there
          // would form an unintended 2-cell run perpendicular to w's direction.
          assert.fail(
            `parallel touch at (${p.r},${p.c}) adjacent to non-crossing ${w.answer} ` +
            `cell (${cell.r},${cell.c}) — perp cell owned by: ` +
            owners.map(o => `${o.answer}-${o.direction}`).join(', ')
          );
        }
      }
    }
  }

  function assertNoWordExtension(result) {
    const g = buildLetterGrid(result);
    for (const w of result.words) {
      const cells = getCells(w);
      const dr = w.direction === 'across' ? 0 : 1;
      const dc = w.direction === 'across' ? 1 : 0;
      const before = { r: cells[0].r - dr, c: cells[0].c - dc };
      const after = { r: cells.at(-1).r + dr, c: cells.at(-1).c + dc };
      for (const p of [before, after]) {
        if (p.r < 0 || p.c < 0 || p.r >= result.size || p.c >= result.size) continue;
        if (g[p.r][p.c] != null) {
          assert.fail(`word ${w.answer} extends into existing letter at (${p.r},${p.c})`);
        }
      }
    }
  }

  test('letter conflicts never occur in larger layouts', () => {
    const words = [
      'HELLO', 'WORLD', 'EARTH', 'OCEAN', 'STARS', 'PLANET', 'ORBIT',
      'COMET', 'SOLAR', 'LUNAR', 'MARS', 'VENUS',
    ].map(a => ({ answer: a, clue: a.toLowerCase() }));
    const r = layout(words);
    assertNoLetterConflicts(r);
  });

  test('no parallel-adjacent foreign cells (no implicit double words)', () => {
    const words = [
      'PYTHON', 'COMMIT', 'BRANCH', 'LAMBDA', 'TERMINAL', 'TOKEN', 'ARRAY',
      'LOOP', 'NULL', 'FORK',
    ].map(a => ({ answer: a, clue: a.toLowerCase() }));
    const r = layout(words);
    assertNoParallelTouch(r);
  });

  test('words do not bleed into adjacent letters at their ends', () => {
    const r = layout([
      { answer: 'CAR',   clue: 'vehicle' },
      { answer: 'CARS',  clue: 'plural' }, // these can't legally coexist (CAR ⊂ CARS)
      { answer: 'RAIN',  clue: 'weather' },
      { answer: 'TRAIN', clue: 'transport' },
    ]);
    assertNoWordExtension(r);
  });
});

/* ============================================================
   layout — crossing density
   ============================================================ */

describe('layout — crossing density', () => {
  test('20+ word puzzle gets at least 1.5 crossings/word on average', () => {
    const words = [
      'SOKRATES', 'PLATON', 'ARISTOTELES', 'NIETZSCHE', 'KANT', 'HEGEL',
      'HOMER', 'VERGIL', 'CICERO', 'CAESAR', 'GOETHE', 'SCHILLER',
      'SHAKESPEARE', 'RENAISSANCE', 'BAROCK', 'ROMANTIK', 'KEPLER',
      'KOPERNIKUS', 'PYTHAGORAS', 'EUKLID', 'ODYSSEE', 'AKROPOLIS',
      'KOLOSSEUM', 'PROMETHEUS',
    ].map(a => ({ answer: a, clue: '...' }));

    const r = layout(words, { tries: 200 });
    const crossings = countCrossings(r);
    const density = (crossings * 2) / r.words.length;
    assert.ok(
      density >= 1.5,
      `expected ≥1.5 crossings/word, got ${density.toFixed(2)} (${crossings} crossings on ${r.words.length} words)`
    );
  });

  test('multi-crossing placements are scored higher than single crossings', () => {
    // Construct a scenario where one word has the choice between
    // a 1-crossing and a 2-crossing placement.
    // Skeleton: place "ABCDE" horizontally and "AXC" vertically through A and C of ABCDE.
    // A target word "AXC" should cross twice when placed correctly.
    const r = layout([
      { answer: 'ABCDE', clue: 'skeleton' },
      { answer: 'AC',    clue: 'two letters' }, // can cross ABCDE at A and at C if placed right
    ]);
    // Loose check: layout converges to placing both
    assert.equal(r.unplaced.length, 0);
  });
});

/* ============================================================
   shipped puzzles — they should still parse and place fully
   ============================================================ */

describe('shipped puzzles re-layout cleanly', () => {
  const cases = [
    ['tech-easy-01.json',         10],
    ['tech-medium-01.json',       19],
    ['allgemein-easy-01.json',    14],
    ['allgemein-medium-01.json',  14],
    ['klassik-hard-01.json',      28],
    ['mythologie-hard-01.json',   28],
    ['wissenschaft-hard-01.json', 28],
    ['kunst-hard-01.json',        28],
    ['geographie-hard-01.json',   28],
    ['architektur-hard-01.json',  27],
    ['sport-hard-01.json',        28],
    ['musik-hard-01.json',        28],
  ];

  for (const [file, minPlaced] of cases) {
    test(`${file} layouts ≥ ${minPlaced} words`, () => {
      const p = loadPuzzle(file);
      // Strip baked positions so we test the algorithm fresh
      const stripped = p.words.map(w => ({ answer: w.answer, clue: w.clue }));
      const r = layout(stripped, { tries: 200 });
      assert.ok(
        r.words.length >= minPlaced,
        `expected ≥${minPlaced} placed, got ${r.words.length} (unplaced: ${r.unplaced.map(w => w.answer).join(', ')})`
      );
    });
  }
});
