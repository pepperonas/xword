/**
 * Crossword Auto-Layout
 *
 * Input:  array of { answer, clue }
 * Output: { size, words: [{ answer, clue, row, col, direction }] }
 *
 * Algorithm:
 *   1. Sort words by length (longest first).
 *   2. Place the longest word horizontally at the origin.
 *   3. For each remaining word: find all valid crossing positions
 *      with already-placed words and score them. Pick best.
 *   4. Normalise coordinates so the grid starts at (0,0) and
 *      compute the smallest square size that fits everything.
 *
 * A placement is valid when:
 *   - At least one cell crosses an existing word at the same letter.
 *   - No cell collides with a different letter.
 *   - The cell immediately before the word's start and immediately
 *     after its end are empty (no accidental word extension).
 *   - No cell of the new word is parallel-adjacent to another cell
 *     of a *different* word in the same direction (no double rows).
 */

(function (global) {
  'use strict';

  const MAX_GRID = 30;          // generous virtual grid before normalisation
  const MIN_FINAL_SIZE = 9;     // ensure a reasonable visual minimum

  function normaliseAnswer(s) {
    return String(s || '')
      .toUpperCase()
      .replace(/[ÄÖÜß]/g, ch => ({ 'Ä': 'AE', 'Ö': 'OE', 'Ü': 'UE', 'ß': 'SS' }[ch]))
      .replace(/[^A-Z]/g, '');
  }

  function makeEmptyGrid(size) {
    const g = [];
    for (let r = 0; r < size; r++) {
      g[r] = new Array(size).fill(null);
      // null = empty; otherwise: letter (string)
    }
    return g;
  }

  function getCells(word) {
    const cells = [];
    for (let i = 0; i < word.answer.length; i++) {
      const r = word.direction === 'across' ? word.row : word.row + i;
      const c = word.direction === 'across' ? word.col + i : word.col;
      cells.push({ r, c, letter: word.answer[i] });
    }
    return cells;
  }

  function inBounds(r, c, size) {
    return r >= 0 && r < size && c >= 0 && c < size;
  }

  /**
   * Validate placement against the virtual grid.
   * grid[r][c] === null means empty, else holds the letter.
   * ownership[r][c] is a Set of word-indices occupying that cell.
   */
  function isValidPlacement(word, grid, ownership, size) {
    const cells = getCells(word);
    let crossings = 0;

    // 1. bounds
    for (const cell of cells) {
      if (!inBounds(cell.r, cell.c, size)) return { ok: false };
    }

    // 2. before-start and after-end must be empty
    const dr = word.direction === 'across' ? 0 : 1;
    const dc = word.direction === 'across' ? 1 : 0;
    const before = { r: word.row - dr, c: word.col - dc };
    const last = cells[cells.length - 1];
    const after = { r: last.r + dr, c: last.c + dc };
    if (inBounds(before.r, before.c, size) && grid[before.r][before.c] !== null) return { ok: false };
    if (inBounds(after.r,  after.c,  size) && grid[after.r][after.c]  !== null) return { ok: false };

    // 3. per cell checks
    for (const cell of cells) {
      const existing = grid[cell.r][cell.c];
      if (existing === null) {
        // empty cell — must not be parallel-adjacent to another *different* word
        // i.e. cells perpendicular to placement direction must be empty unless
        // they belong to a word crossing here (which they can't, since this cell is empty)
        const perp1 = word.direction === 'across' ? { r: cell.r - 1, c: cell.c } : { r: cell.r, c: cell.c - 1 };
        const perp2 = word.direction === 'across' ? { r: cell.r + 1, c: cell.c } : { r: cell.r, c: cell.c + 1 };
        if (inBounds(perp1.r, perp1.c, size) && grid[perp1.r][perp1.c] !== null) return { ok: false };
        if (inBounds(perp2.r, perp2.c, size) && grid[perp2.r][perp2.c] !== null) return { ok: false };
      } else {
        // occupied — must match the letter (crossing)
        if (existing !== cell.letter) return { ok: false };
        // existing cell must NOT be owned by a word running in the same direction.
        // Otherwise a short word can slip into the tail of a long word and
        // look like a sequence of "crossings" while actually overlapping it.
        const owners = ownership[cell.r][cell.c];
        if (owners) {
          for (const o of owners) {
            if (o.direction === word.direction) return { ok: false };
          }
        }
        crossings++;
      }
    }

    // 4. must have at least one crossing (unless first word)
    return { ok: true, crossings };
  }

  function applyPlacement(word, grid, ownership) {
    for (const cell of getCells(word)) {
      grid[cell.r][cell.c] = cell.letter;
      if (!ownership[cell.r][cell.c]) ownership[cell.r][cell.c] = new Set();
      ownership[cell.r][cell.c].add(word);
    }
  }

  function findCandidates(word, placed, grid, ownership, size) {
    const candidates = [];
    const answer = word.answer;

    for (let pi = 0; pi < placed.length; pi++) {
      const placedWord = placed[pi];
      // a new word should cross perpendicular to placedWord
      const newDir = placedWord.direction === 'across' ? 'down' : 'across';

      const placedCells = getCells(placedWord);
      for (const pc of placedCells) {
        // find positions in answer where letter matches pc.letter
        for (let i = 0; i < answer.length; i++) {
          if (answer[i] !== pc.letter) continue;
          // candidate origin
          const origin = newDir === 'across'
            ? { row: pc.r, col: pc.c - i }
            : { row: pc.r - i, col: pc.c };
          const candidate = { answer, row: origin.row, col: origin.col, direction: newDir };
          const valid = isValidPlacement(candidate, grid, ownership, size);
          if (valid.ok && valid.crossings >= 1) {
            candidates.push({ ...candidate, crossings: valid.crossings });
          }
        }
      }
    }
    return candidates;
  }

  function scoreCandidate(c, placed, gridSize) {
    // Strongly prefer multi-crossings (quadratic); fall back to single
    // crossings; tiebreak on central placement.
    const cellsInWord = c.answer.length;
    const center = gridSize / 2;
    const wordCenterR = c.direction === 'across' ? c.row : c.row + cellsInWord / 2;
    const wordCenterC = c.direction === 'across' ? c.col + cellsInWord / 2 : c.col;
    const dist = Math.hypot(wordCenterR - center, wordCenterC - center);
    return c.crossings * c.crossings * 500 + c.crossings * 50 - dist;
  }

  function getBounds(placed) {
    let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
    for (const w of placed) {
      const cells = getCells(w);
      for (const cell of cells) {
        if (cell.r < minR) minR = cell.r;
        if (cell.c < minC) minC = cell.c;
        if (cell.r > maxR) maxR = cell.r;
        if (cell.c > maxC) maxC = cell.c;
      }
    }
    return { minR, minC, maxR, maxC, height: maxR - minR + 1, width: maxC - minC + 1 };
  }

  /**
   * Try to lay out words. Returns the best successful attempt
   * across multiple shuffled tries with multi-pass placement.
   */
  function layout(rawWords, opts = {}) {
    const tries = opts.tries || 80;
    let best = null;

    const cleaned = rawWords
      .map(w => ({ ...w, answer: normaliseAnswer(w.answer) }))
      .filter(w => w.answer.length >= 2);

    if (cleaned.length === 0) {
      return { size: MIN_FINAL_SIZE, words: [], unplaced: [] };
    }

    for (let attempt = 0; attempt < tries; attempt++) {
      const result = attemptLayout(cleaned, attempt);
      if (!best || result.placed.length > best.placed.length ||
          (result.placed.length === best.placed.length && result.size < best.size)) {
        best = result;
      }
      if (result.placed.length === cleaned.length && result.size <= 13) break;
    }

    return { size: best.size, words: best.placed, unplaced: best.unplaced };
  }

  function attemptLayout(words, seed) {
    // Order: longest words tend first, but with attempt-dependent randomness
    // so each attempt explores a different placement sequence.
    const rng = mulberry32(seed * 9301 + 49297);

    const sorted = [...words].sort((a, b) => {
      const lenDiff = b.answer.length - a.answer.length;
      if (lenDiff !== 0) {
        // 30% chance to swap; more randomness in later attempts
        if (rng() < 0.3) return -lenDiff;
        return lenDiff;
      }
      return rng() - 0.5;
    });

    // Optionally pick a different seed word: in later attempts, use index `seed % top-K`
    const topK = Math.min(5, sorted.length);
    const seedIndex = seed % topK;
    if (seedIndex !== 0) {
      const w = sorted.splice(seedIndex, 1)[0];
      sorted.unshift(w);
    }

    const size = MAX_GRID;
    const grid = makeEmptyGrid(size);
    const ownership = Array.from({ length: size }, () => new Array(size).fill(null));

    const firstDir = seed % 2 === 0 ? 'across' : 'down';
    const first = firstDir === 'across'
      ? { ...sorted[0], direction: 'across', row: Math.floor(size / 2), col: Math.floor((size - sorted[0].answer.length) / 2) }
      : { ...sorted[0], direction: 'down',   row: Math.floor((size - sorted[0].answer.length) / 2), col: Math.floor(size / 2) };
    applyPlacement(first, grid, ownership);

    const placed = [first];
    let queue = sorted.slice(1);

    // Multi-pass: try the queue repeatedly until no progress is made.
    let progressed = true;
    while (progressed && queue.length > 0) {
      progressed = false;
      const stillUnplaced = [];
      for (const word of queue) {
        const candidates = findCandidates(word, placed, grid, ownership, size);
        if (candidates.length === 0) {
          stillUnplaced.push(word);
          continue;
        }
        candidates.sort((a, b) => scoreCandidate(b, placed, size) - scoreCandidate(a, placed, size));
        const chosen = candidates[0];
        const placedWord = { ...word, row: chosen.row, col: chosen.col, direction: chosen.direction };
        applyPlacement(placedWord, grid, ownership);
        placed.push(placedWord);
        progressed = true;
      }
      queue = stillUnplaced;
    }

    const b = getBounds(placed);
    placed.forEach(w => { w.row -= b.minR; w.col -= b.minC; });
    const finalSize = Math.max(b.height, b.width, MIN_FINAL_SIZE);

    return { size: finalSize, placed, unplaced: queue };
  }

  // Deterministic PRNG (so re-running the same seed gives same layout)
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return h;
  }

  global.XwordLayout = { layout, normaliseAnswer };
})(typeof window !== 'undefined' ? window : globalThis);
