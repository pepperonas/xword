/**
 * Crossword Engine
 *
 * Stateless module that takes a puzzle definition + DOM refs,
 * sets up the playable game, and exposes a small control API.
 *
 * Puzzle definition (after layout):
 *   { size: number, words: [{ answer, clue, row, col, direction }] }
 */

(function (global) {
  'use strict';

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }

  function createGame(puzzle, refs, callbacks = {}) {
    const $$ = sel => refs.root.querySelectorAll(sel);

    const state = {
      size: puzzle.size,
      grid: [],
      words: [],
      active: null,
      liveValidate: false,
      hardcore: false,
      startTime: null,
      timerInterval: null,
      hintCount: 0,
      solved: false,
      elapsedBaseMs: 0, // accumulated time before this session
      solvedWordKeys: new Set(), // words currently solved — for newly-solved detection
      bootstrapped: false,       // prevents animations on initial-state restore
    };
    let keydownHandler, clickHandler;

    function emitProgress() {
      if (!callbacks.onProgressChange) return;
      const cells = {};
      const hinted = [];
      let totalCells = 0;
      let filledCells = 0;
      for (let r = 0; r < state.size; r++) {
        for (let c = 0; c < state.size; c++) {
          const cell = state.grid[r][c];
          if (cell.isBlock) continue;
          totalCells++;
          if (cell.letter) {
            cells[r + ',' + c] = cell.letter;
            filledCells++;
          }
          if (cell.hinted) hinted.push(r + ',' + c);
        }
      }
      callbacks.onProgressChange({
        grid_state: cells,
        hinted_cells: hinted,
        hint_count: state.hintCount,
        elapsed_ms: currentElapsedMs(),
        solved: state.solved,
        percent: totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0,
        hardcore: state.hardcore,
        live_validate: state.liveValidate,
      });
    }

    function currentElapsedMs() {
      const live = state.startTime ? (Date.now() - state.startTime) : 0;
      return state.elapsedBaseMs + live;
    }

    function buildGrid() {
      const g = [];
      for (let r = 0; r < state.size; r++) {
        g[r] = [];
        for (let c = 0; c < state.size; c++) {
          g[r][c] = { letter: '', answer: '', words: {}, num: 0, isBlock: true, hinted: false };
        }
      }

      state.words = puzzle.words.map((w, i) => ({ ...w, key: `${w.direction}-${i}`, idx: i }));

      state.words.forEach(w => {
        const ans = w.answer.toUpperCase();
        for (let i = 0; i < ans.length; i++) {
          const r = w.direction === 'across' ? w.row : w.row + i;
          const c = w.direction === 'across' ? w.col + i : w.col;
          if (r < 0 || c < 0 || r >= state.size || c >= state.size) continue;
          const cell = g[r][c];
          cell.isBlock = false;
          cell.answer = ans[i];
          cell.words[w.direction] = w.key;
        }
      });

      let nextNum = 1;
      const numMap = {};
      for (let r = 0; r < state.size; r++) {
        for (let c = 0; c < state.size; c++) {
          const cell = g[r][c];
          if (cell.isBlock) continue;
          const startsAcross = !!cell.words.across && (c === 0 || g[r][c - 1].isBlock);
          const startsDown = !!cell.words.down && (r === 0 || g[r - 1][c].isBlock);
          if (startsAcross || startsDown) {
            cell.num = nextNum;
            if (startsAcross) numMap[cell.words.across] = nextNum;
            if (startsDown) numMap[cell.words.down] = nextNum;
            nextNum++;
          }
        }
      }

      state.words.forEach(w => { w.num = numMap[w.key] || (w.idx + 1); });
      state.grid = g;

      // Apply initial state (from server-side saved progress, if any)
      if (callbacks.initialState && typeof callbacks.initialState === 'object') {
        const init = callbacks.initialState;
        if (init.grid_state && typeof init.grid_state === 'object') {
          for (const k in init.grid_state) {
            const [r, c] = k.split(',').map(Number);
            if (Number.isFinite(r) && Number.isFinite(c) && state.grid[r] && state.grid[r][c] && !state.grid[r][c].isBlock) {
              state.grid[r][c].letter = String(init.grid_state[k] || '').toUpperCase();
            }
          }
        }
        if (Array.isArray(init.hinted_cells)) {
          for (const k of init.hinted_cells) {
            const [r, c] = String(k).split(',').map(Number);
            if (Number.isFinite(r) && Number.isFinite(c) && state.grid[r] && state.grid[r][c] && !state.grid[r][c].isBlock) {
              state.grid[r][c].hinted = true;
            }
          }
        }
        if (typeof init.hint_count === 'number') state.hintCount = init.hint_count;
        if (typeof init.elapsed_ms === 'number') state.elapsedBaseMs = init.elapsed_ms;
        if (init.hardcore) state.hardcore = true;
        if (init.live_validate) state.liveValidate = true;
        // Mutually exclusive — hardcore wins if both somehow set
        if (state.hardcore) state.liveValidate = false;
      }
    }

    function renderGrid() {
      const gridEl = refs.grid;
      gridEl.replaceChildren();
      gridEl.style.gridTemplateColumns = `repeat(${state.size}, 1fr)`;
      gridEl.style.gridTemplateRows = `repeat(${state.size}, 1fr)`;
      for (let r = 0; r < state.size; r++) {
        for (let c = 0; c < state.size; c++) {
          const cell = state.grid[r][c];
          const cellEl = el('div', 'cell' + (cell.isBlock ? ' block' : ''));
          cellEl.dataset.r = r;
          cellEl.dataset.c = c;
          if (!cell.isBlock) {
            if (cell.num) cellEl.appendChild(el('div', 'num', String(cell.num)));
            cellEl.appendChild(el('div', 'letter', cell.letter));
            cellEl.addEventListener('click', () => onCellClick(r, c));
          }
          gridEl.appendChild(cellEl);
        }
      }
      refs.boardMeta.textContent = `${state.size} × ${state.size}`;
    }

    function renderClues() {
      const aWords = state.words.filter(w => w.direction === 'across').sort((a, b) => a.num - b.num);
      const dWords = state.words.filter(w => w.direction === 'down').sort((a, b) => a.num - b.num);
      refs.countAcross.textContent = aWords.length;
      refs.countDown.textContent = dWords.length;

      const fillList = (container, words) => {
        container.replaceChildren();
        words.forEach(w => {
          const item = el('div', 'clue-item');
          item.dataset.key = w.key;
          const numEl = el('div', 'clue-num', String(w.num));
          const txtEl = el('div', 'clue-text', w.clue);
          const lenEl = el('span', 'len', `(${w.answer.length})`);
          txtEl.appendChild(document.createTextNode(' '));
          txtEl.appendChild(lenEl);
          item.appendChild(numEl);
          item.appendChild(txtEl);
          item.addEventListener('click', () => activateWord(w.key, true));
          container.appendChild(item);
        });
      };
      fillList(refs.cluesAcross, aWords);
      fillList(refs.cluesDown, dWords);
    }

    /**
     * "Protected" = a cell holds a letter that's part of a different word
     * which is currently fully solved. Deleting or overwriting it would
     * destroy the other word's correctness, so we skip past it on input
     * and on backspace.
     */
    function isProtectedCell(r, c) {
      const cell = state.grid[r] && state.grid[r][c];
      if (!cell || cell.isBlock || !cell.letter) return false;
      const activeKey = state.active ? state.active.wordId : null;
      for (const dir of ['across', 'down']) {
        const otherKey = cell.words[dir];
        if (!otherKey || otherKey === activeKey) continue;
        const otherWord = state.words.find(w => w.key === otherKey);
        if (otherWord && isWordCorrect(otherWord)) return true;
      }
      return false;
    }

    function wordCells(w) {
      const cells = [];
      for (let i = 0; i < w.answer.length; i++) {
        const r = w.direction === 'across' ? w.row : w.row + i;
        const c = w.direction === 'across' ? w.col + i : w.col;
        cells.push({ r, c });
      }
      return cells;
    }

    /** First empty cell of a word, or the word's start if everything is filled. */
    function firstEmptyInWord(w) {
      for (const cell of wordCells(w)) {
        if (!state.grid[cell.r][cell.c].letter) return cell;
      }
      return { r: w.row, c: w.col };
    }

    function activateWord(key, scrollIntoView = false) {
      const word = state.words.find(w => w.key === key);
      if (!word) return;
      // Snap the cursor to the first empty cell — that's where the user
      // wants to start typing. Cells already filled by solved crossings get
      // skipped automatically because they aren't "empty".
      const start = firstEmptyInWord(word);
      state.active = { wordId: word.key, dir: word.direction, row: start.r, col: start.c };
      paint();
      setActiveTab(word.direction);
      if (scrollIntoView) {
        const item = refs.root.querySelector(`.clue-item[data-key="${key}"]`);
        if (item) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      focusHiddenInput();
    }

    function onCellClick(r, c) {
      const cell = state.grid[r][c];
      if (cell.isBlock) return;
      const a = state.active;
      if (a && a.row === r && a.col === c) {
        const other = a.dir === 'across' ? 'down' : 'across';
        if (cell.words[other]) {
          state.active = { wordId: cell.words[other], dir: other, row: r, col: c };
          paint();
          setActiveTab(other);
          focusHiddenInput();
          return;
        }
      }
      let dir = a ? a.dir : 'across';
      if (!cell.words[dir]) dir = cell.words.across ? 'across' : 'down';
      state.active = { wordId: cell.words[dir], dir, row: r, col: c };
      paint();
      setActiveTab(dir);
      focusHiddenInput();
    }

    function setActiveTab(dir) {
      $$('.clues-tab').forEach(t => t.classList.toggle('active', t.dataset.dir === dir));
      $$('.clues-section').forEach(s => s.classList.toggle('visible-mobile', s.dataset.dir === dir));
      $$('.clues-section').forEach(s => s.classList.toggle('visible', s.dataset.dir === dir));
    }

    function paint() {
      const a = state.active;
      const wordCells = new Set();
      if (a) {
        const w = state.words.find(x => x.key === a.wordId);
        if (w) {
          for (let i = 0; i < w.answer.length; i++) {
            const r = w.direction === 'across' ? w.row : w.row + i;
            const c = w.direction === 'across' ? w.col + i : w.col;
            wordCells.add(`${r},${c}`);
          }
        }
      }

      const solvedCells = new Set();
      // Hardcore mode hides the correct-word highlight entirely
      if (!state.hardcore) {
        state.words.forEach(w => {
          if (isWordCorrect(w)) {
            for (let i = 0; i < w.answer.length; i++) {
              const r = w.direction === 'across' ? w.row : w.row + i;
              const c = w.direction === 'across' ? w.col + i : w.col;
              solvedCells.add(`${r},${c}`);
            }
          }
        });
      }

      $$('.cell').forEach(cellEl => {
        const r = +cellEl.dataset.r, c = +cellEl.dataset.c;
        const cell = state.grid[r][c];
        if (cell.isBlock) return;
        cellEl.classList.remove('active', 'active-word', 'correct-word', 'error', 'hinted');
        const letterEl = cellEl.querySelector('.letter');
        if (letterEl) letterEl.textContent = cell.letter;
        if (solvedCells.has(`${r},${c}`)) cellEl.classList.add('correct-word');
        if (wordCells.has(`${r},${c}`)) cellEl.classList.add('active-word');
        if (a && a.row === r && a.col === c) cellEl.classList.add('active');
        if (cell.hinted) cellEl.classList.add('hinted');
      });

      $$('.clue-item').forEach(item => {
        item.classList.toggle('active', !!(a && item.dataset.key === a.wordId));
        const w = state.words.find(x => x.key === item.dataset.key);
        const showSolved = !state.hardcore && w && isWordCorrect(w);
        item.classList.toggle('solved', !!showSolved);
      });

      if (a) {
        const w = state.words.find(x => x.key === a.wordId);
        if (w) {
          refs.currentBadge.textContent = `${w.num} ${w.direction === 'across' ? 'Horizontal' : 'Vertikal'}`;
          refs.currentText.textContent = `${w.clue} (${w.answer.length})`;
        }
      } else {
        refs.currentBadge.textContent = '—';
        refs.currentText.textContent = 'Wähle ein Wort, um zu beginnen.';
      }

      updateStats();
    }

    function isWordCorrect(w) {
      for (let i = 0; i < w.answer.length; i++) {
        const r = w.direction === 'across' ? w.row : w.row + i;
        const c = w.direction === 'across' ? w.col + i : w.col;
        if (state.grid[r][c].letter !== w.answer[i]) return false;
      }
      return true;
    }

    function updateStats() {
      let totalCells = 0, filledCells = 0, solvedWords = 0;
      for (let r = 0; r < state.size; r++) {
        for (let c = 0; c < state.size; c++) {
          const cell = state.grid[r][c];
          if (!cell.isBlock) {
            totalCells++;
            if (cell.letter) filledCells++;
          }
        }
      }
      const newlySolved = [];
      state.words.forEach(w => {
        if (isWordCorrect(w)) {
          solvedWords++;
          if (!state.solvedWordKeys.has(w.key)) {
            state.solvedWordKeys.add(w.key);
            if (state.bootstrapped) newlySolved.push(w);
          }
        } else if (state.solvedWordKeys.has(w.key)) {
          state.solvedWordKeys.delete(w.key);
        }
      });
      const pct = totalCells ? Math.round((filledCells / totalCells) * 100) : 0;
      refs.statPercent.textContent = pct;
      refs.statSolved.textContent = solvedWords;
      refs.statTotal.textContent = state.words.length;
      refs.statHints.textContent = state.hintCount;
      refs.progressFill.style.right = `${100 - pct}%`;

      const willComplete = solvedWords === state.words.length && totalCells > 0;

      // Only flash newly solved words if this is NOT the final win — the
      // full-puzzle solve-wave already handles all cells visually.
      if (!willComplete) {
        newlySolved.forEach(animateWordSolve);
      }

      if (!state.solved && willComplete) {
        state.solved = true;
        win();
        emitProgress();
      }
    }

    function animateWordSolve(w) {
      const cells = wordCells(w);
      cells.forEach((pos, i) => {
        setTimeout(() => {
          const cellEl = refs.root.querySelector(`.cell[data-r="${pos.r}"][data-c="${pos.c}"]`);
          if (!cellEl) return;
          cellEl.classList.remove('word-solve-flash');
          void cellEl.offsetWidth;
          cellEl.classList.add('word-solve-flash');
          setTimeout(() => cellEl.classList.remove('word-solve-flash'), 600);
        }, i * 55);
      });
    }

    // Non-breaking space. Kept in the hidden input at all times so that
    // mobile virtual keyboards fire input/beforeinput events on Backspace
    // (an empty input has nothing to "delete" → iOS silently swallows the
    // key, which is why the first backspace press appears to do nothing).
    const SENTINEL = ' ';

    function resetSentinel() {
      const inp = refs.hiddenInput;
      if (inp.value !== SENTINEL) inp.value = SENTINEL;
      try { inp.setSelectionRange(SENTINEL.length, SENTINEL.length); } catch (e) {}
    }

    function focusHiddenInput() {
      const inp = refs.hiddenInput;
      inp.focus({ preventScroll: true });
      resetSentinel();
    }

    // Dedupe duplicate event-source firings (see assets/input-dedupe.js).
    const isFreshAction = global.XwordInputDedupe.createDedupe(60);
    function dispatchAction(kind, value) {
      const key = kind + ':' + (value || '');
      if (!isFreshAction(key)) return;
      if (kind === 'delete') deleteLetter();
      else if (kind === 'type') typeLetter(value);
    }

    function moveActive(dr, dc) {
      if (!state.active) return;
      let r = state.active.row + dr, c = state.active.col + dc;
      while (r >= 0 && r < state.size && c >= 0 && c < state.size) {
        if (!state.grid[r][c].isBlock) {
          state.active.row = r;
          state.active.col = c;
          const cell = state.grid[r][c];
          const dir = state.active.dir;
          if (cell.words[dir]) {
            state.active.wordId = cell.words[dir];
          } else {
            const other = dir === 'across' ? 'down' : 'across';
            if (cell.words[other]) {
              state.active.dir = other;
              state.active.wordId = cell.words[other];
            }
          }
          paint();
          return;
        }
        r += dr; c += dc;
      }
    }

    function nextCellInWord() {
      if (!state.active) return;
      const a = state.active;
      const w = state.words.find(x => x.key === a.wordId);
      if (!w) return;
      const cells = [];
      for (let i = 0; i < w.answer.length; i++) {
        const r = w.direction === 'across' ? w.row : w.row + i;
        const c = w.direction === 'across' ? w.col + i : w.col;
        cells.push({ r, c });
      }
      const curIdx = cells.findIndex(p => p.r === a.row && p.c === a.col);
      for (let i = curIdx + 1; i < cells.length; i++) {
        if (!state.grid[cells[i].r][cells[i].c].letter) {
          a.row = cells[i].r; a.col = cells[i].c;
          paint();
          return;
        }
      }
      for (let i = 0; i < curIdx; i++) {
        if (!state.grid[cells[i].r][cells[i].c].letter) {
          a.row = cells[i].r; a.col = cells[i].c;
          paint();
          return;
        }
      }
      if (curIdx + 1 < cells.length) {
        a.row = cells[curIdx + 1].r; a.col = cells[curIdx + 1].c;
        paint();
      }
    }

    function prevCellInWord() {
      if (!state.active) return;
      const a = state.active;
      const w = state.words.find(x => x.key === a.wordId);
      if (!w) return;
      if (a.dir === 'across') {
        if (a.col > w.col) { a.col--; paint(); }
      } else {
        if (a.row > w.row) { a.row--; paint(); }
      }
    }

    function jumpToNextWord(forward = true) {
      if (state.words.length === 0) return;
      const sorted = [...state.words].sort((a, b) => {
        if (a.direction !== b.direction) return a.direction === 'across' ? -1 : 1;
        return a.num - b.num;
      });
      const sortedIdx = state.active ? sorted.findIndex(w => w.key === state.active.wordId) : -1;
      const next = forward
        ? sorted[(sortedIdx + 1 + sorted.length) % sorted.length]
        : sorted[(sortedIdx - 1 + sorted.length) % sorted.length];
      activateWord(next.key, true);
    }

    function typeLetter(ch) {
      if (!state.active) return;

      // If the cursor is sitting on a cell that's already correctly filled
      // by a solved crossing word, don't overwrite it — advance past first.
      if (isProtectedCell(state.active.row, state.active.col)) {
        const beforeKey = state.active.row + ',' + state.active.col;
        nextCellInWord();
        const afterKey = state.active.row + ',' + state.active.col;
        if (beforeKey === afterKey || isProtectedCell(state.active.row, state.active.col)) {
          return; // no typable position available
        }
      }

      const { row, col } = state.active;
      const cell = state.grid[row][col];
      if (cell.isBlock) return;
      cell.letter = ch.toUpperCase();
      if (state.liveValidate) liveCheckCell(row, col);
      nextCellInWord();
      paint();
      // Re-locate the letter element after paint() and trigger the type-in
      // animation. Using requestAnimationFrame so the class is applied on
      // the next render tick — guarantees the animation always re-plays.
      requestAnimationFrame(() => {
        const letterEl = refs.root.querySelector(`.cell[data-r="${row}"][data-c="${col}"] .letter`);
        if (letterEl) {
          letterEl.classList.remove('type-in');
          void letterEl.offsetWidth;
          letterEl.classList.add('type-in');
        }
      });
      emitProgress();
    }

    /**
     * Backspace behaviour:
     *   - If the current cell has the user's own letter (not protected by a
     *     solved crossing), clear it. Cursor stays.
     *   - Otherwise walk backward through the word, skipping protected cells
     *     and empty gaps, until we find a cell holding a user-deletable letter.
     *     Clear that one and place the cursor there.
     * One keypress = one user letter removed.
     */
    function deleteLetter() {
      if (!state.active) return;
      const a = state.active;
      const here = state.grid[a.row][a.col];

      if (here.letter && !isProtectedCell(a.row, a.col)) {
        here.letter = '';
        paint();
        emitProgress();
        return;
      }

      // Walk backward to find the previous deletable cell.
      const w = state.words.find(x => x.key === a.wordId);
      if (!w) return;
      const cells = wordCells(w);
      const idx = cells.findIndex(p => p.r === a.row && p.c === a.col);

      for (let i = idx - 1; i >= 0; i--) {
        const { r, c } = cells[i];
        const cell = state.grid[r][c];
        if (cell.letter && !isProtectedCell(r, c)) {
          cell.letter = '';
          a.row = r;
          a.col = c;
          paint();
          emitProgress();
          return;
        }
      }
      // No deletable cell found behind us — leave the state unchanged.
    }

    function liveCheckCell(r, c) {
      const cell = state.grid[r][c];
      if (!cell.letter) return;
      const cellEl = refs.root.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
      if (!cellEl) return;
      if (cell.letter === cell.answer) {
        cellEl.classList.add('correct-flash');
        setTimeout(() => cellEl.classList.remove('correct-flash'), 400);
      } else {
        cellEl.classList.add('error');
        cellEl.classList.add('error-flash');
        setTimeout(() => cellEl.classList.remove('error-flash'), 300);
      }
    }

    function setupKeyboard() {
      const inp = refs.hiddenInput;
      // beforeinput exposes inputType, the only reliable signal for
      // "user pressed Backspace" on iOS virtual keyboards.
      inp.addEventListener('beforeinput', (e) => {
        if (e.inputType === 'deleteContentBackward' ||
            e.inputType === 'deleteContentForward'  ||
            e.inputType === 'deleteWordBackward'    ||
            e.inputType === 'deleteByCut') {
          e.preventDefault();
          dispatchAction('delete');
          resetSentinel();
          return;
        }
        if (e.inputType && e.inputType.startsWith('insert') && e.data) {
          for (const ch of e.data) {
            if (/^[a-zA-ZäöüÄÖÜß]$/.test(ch)) dispatchAction('type', ch);
          }
          e.preventDefault();
          resetSentinel();
        }
      });
      // Fallback for browsers without beforeinput (rare nowadays).
      inp.addEventListener('input', (e) => {
        const v = e.target.value;
        if (v.length > SENTINEL.length) {
          const ch = v[v.length - 1];
          if (/^[a-zA-ZäöüÄÖÜß]$/.test(ch)) dispatchAction('type', ch);
        } else if (v.length < SENTINEL.length) {
          dispatchAction('delete');
        }
        resetSentinel();
      });

      keydownHandler = (e) => {
        if (e.target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
        const k = e.key;
        if (k === 'Backspace') {
          e.preventDefault();
          dispatchAction('delete');
          return;
        }
        if (k === 'Delete') {
          e.preventDefault();
          if (state.active) { state.grid[state.active.row][state.active.col].letter = ''; paint(); }
          return;
        }
        if (k === 'ArrowUp') {
          e.preventDefault();
          if (state.active && state.active.dir !== 'down') {
            state.active.dir = 'down';
            const c = state.grid[state.active.row][state.active.col];
            if (c.words.down) state.active.wordId = c.words.down;
            paint(); return;
          }
          moveActive(-1, 0); return;
        }
        if (k === 'ArrowDown') {
          e.preventDefault();
          if (state.active && state.active.dir !== 'down') {
            state.active.dir = 'down';
            const c = state.grid[state.active.row][state.active.col];
            if (c.words.down) state.active.wordId = c.words.down;
            paint(); return;
          }
          moveActive(1, 0); return;
        }
        if (k === 'ArrowLeft') {
          e.preventDefault();
          if (state.active && state.active.dir !== 'across') {
            state.active.dir = 'across';
            const c = state.grid[state.active.row][state.active.col];
            if (c.words.across) state.active.wordId = c.words.across;
            paint(); return;
          }
          moveActive(0, -1); return;
        }
        if (k === 'ArrowRight') {
          e.preventDefault();
          if (state.active && state.active.dir !== 'across') {
            state.active.dir = 'across';
            const c = state.grid[state.active.row][state.active.col];
            if (c.words.across) state.active.wordId = c.words.across;
            paint(); return;
          }
          moveActive(0, 1); return;
        }
        if (k === 'Tab') { e.preventDefault(); jumpToNextWord(!e.shiftKey); return; }
        if (k === 'Enter') {
          e.preventDefault();
          if (state.active) {
            const cell = state.grid[state.active.row][state.active.col];
            const other = state.active.dir === 'across' ? 'down' : 'across';
            if (cell.words[other]) {
              state.active.dir = other;
              state.active.wordId = cell.words[other];
              paint();
            }
          }
          return;
        }
        if (/^[a-zA-ZäöüÄÖÜß]$/.test(k)) {
          e.preventDefault();
          dispatchAction('type', k);
        }
      };

      // Re-focus the hidden input on any tap inside the grid or clue list.
      // Must be synchronous — setTimeout breaks iOS Safari's user-gesture
      // requirement and the virtual keyboard then refuses to open.
      clickHandler = (e) => {
        if (e.target.closest('.grid') || e.target.closest('.clue-item')) {
          focusHiddenInput();
        }
      };

      document.addEventListener('keydown', keydownHandler);
      document.addEventListener('click', clickHandler);
    }

    function destroyKeyboard() {
      if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
      if (clickHandler) document.removeEventListener('click', clickHandler);
    }

    function actionCheck() {
      for (let r = 0; r < state.size; r++) {
        for (let c = 0; c < state.size; c++) {
          const cell = state.grid[r][c];
          if (cell.isBlock) continue;
          const cellEl = refs.root.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
          if (!cellEl) continue;
          if (cell.letter && cell.letter !== cell.answer) cellEl.classList.add('error');
          else cellEl.classList.remove('error');
        }
      }
      paint();
    }

    function actionHint() {
      let candidates = [];
      if (state.active) {
        const w = state.words.find(x => x.key === state.active.wordId);
        if (w) {
          for (let i = 0; i < w.answer.length; i++) {
            const r = w.direction === 'across' ? w.row : w.row + i;
            const c = w.direction === 'across' ? w.col + i : w.col;
            if (state.grid[r][c].letter !== state.grid[r][c].answer) candidates.push({ r, c });
          }
        }
      }
      if (candidates.length === 0) {
        for (let r = 0; r < state.size; r++) {
          for (let c = 0; c < state.size; c++) {
            const cell = state.grid[r][c];
            if (!cell.isBlock && cell.letter !== cell.answer) candidates.push({ r, c });
          }
        }
      }
      if (candidates.length === 0) return;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      state.grid[pick.r][pick.c].letter = state.grid[pick.r][pick.c].answer;
      state.grid[pick.r][pick.c].hinted = true;
      state.hintCount++;
      paint();
      requestAnimationFrame(() => {
        const letterEl = refs.root.querySelector(`.cell[data-r="${pick.r}"][data-c="${pick.c}"] .letter`);
        if (letterEl) {
          letterEl.classList.remove('hint-drop');
          void letterEl.offsetWidth;
          letterEl.classList.add('hint-drop');
        }
      });
      emitProgress();
    }

    function actionReveal() {
      if (!confirm('Möchtest du wirklich die komplette Lösung anzeigen? Das beendet das Rätsel.')) return;
      for (let r = 0; r < state.size; r++) {
        for (let c = 0; c < state.size; c++) {
          const cell = state.grid[r][c];
          if (!cell.isBlock) {
            if (cell.letter !== cell.answer) cell.hinted = true;
            cell.letter = cell.answer;
          }
        }
      }
      paint();
    }

    function actionReset() {
      if (!confirm('Möchtest du das Rätsel zurücksetzen? Aller Fortschritt geht verloren.')) return;
      for (let r = 0; r < state.size; r++) {
        for (let c = 0; c < state.size; c++) {
          const cell = state.grid[r][c];
          if (!cell.isBlock) { cell.letter = ''; cell.hinted = false; }
        }
      }
      state.hintCount = 0;
      state.solved = false;
      state.elapsedBaseMs = 0;
      state.startTime = Date.now();
      refs.overlay.classList.remove('show');
      paint();
      emitProgress();
    }

    function startTimer() {
      state.startTime = Date.now();
      if (state.timerInterval) clearInterval(state.timerInterval);
      refs.statTime.textContent = formatTime(currentElapsedMs());
      state.timerInterval = setInterval(() => {
        refs.statTime.textContent = formatTime(currentElapsedMs());
      }, 1000);
    }
    function formatTime(ms) {
      const total = Math.floor(ms / 1000);
      const m = String(Math.floor(total / 60)).padStart(2, '0');
      const s = String(total % 60).padStart(2, '0');
      return `${m}:${s}`;
    }

    function win() {
      clearInterval(state.timerInterval);
      refs.winTime.textContent = refs.statTime.textContent;
      refs.winHints.textContent = state.hintCount;
      refs.winWords.textContent = state.words.length;
      // Solve-wave: animate each filled cell, staggered by manhattan distance from top-left
      const cells = refs.root.querySelectorAll('.cell:not(.block)');
      cells.forEach(cellEl => {
        const r = +cellEl.dataset.r, c = +cellEl.dataset.c;
        const delay = (r + c) * 35;
        setTimeout(() => {
          cellEl.classList.add('solve-wave');
          setTimeout(() => cellEl.classList.remove('solve-wave'), 800);
        }, delay);
      });
      const lastDelay = (state.size * 2) * 35;
      setTimeout(() => {
        refs.overlay.classList.add('show');
        launchConfetti();
      }, Math.min(lastDelay + 350, 1400));
    }

    function launchConfetti() {
      const wrap = refs.confetti;
      wrap.replaceChildren();
      const colors = ['#c8a96a', '#f5c842', '#d4b878', '#6b4ea0', '#a890d4', '#2d6e4e', '#5ec896', '#b03030', '#1a1a1a', '#faf7f0'];
      const total = 140;
      for (let i = 0; i < total; i++) {
        const piece = el('span');
        piece.style.left = (Math.random() * 100) + '%';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = (Math.random() * 0.8) + 's';
        piece.style.animationDuration = (2.5 + Math.random() * 2.5) + 's';
        piece.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
        // Vary sizes for depth
        const scale = 0.6 + Math.random() * 0.8;
        piece.style.width  = (8 * scale) + 'px';
        piece.style.height = (14 * scale) + 'px';
        // Some pieces drift sideways
        piece.style.setProperty('--drift', (Math.random() * 200 - 100) + 'px');
        wrap.appendChild(piece);
      }
      setTimeout(() => { wrap.replaceChildren(); }, 6000);
    }

    function bindUI() {
      refs.btnCheck.onclick = () => { actionCheck(); focusHiddenInput(); };
      refs.btnHint.onclick = () => { actionHint(); focusHiddenInput(); };
      refs.btnReveal.onclick = () => { actionReveal(); focusHiddenInput(); };
      refs.btnReset.onclick = () => { actionReset(); focusHiddenInput(); };
      refs.btnPlayAgain.onclick = () => actionReset();
      refs.btnBackFromWin.onclick = () => {
        refs.overlay.classList.remove('show');
        callbacks.onBack && callbacks.onBack();
      };
      refs.liveToggle.onclick = () => {
        state.liveValidate = !state.liveValidate;
        if (state.liveValidate && state.hardcore) {
          state.hardcore = false;
          refs.hardcoreToggle && refs.hardcoreToggle.classList.remove('on');
        }
        refs.liveToggle.classList.toggle('on', state.liveValidate);
        paint();
        emitProgress();
      };
      refs.liveToggle.onkeydown = (e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); refs.liveToggle.click(); }
      };
      if (refs.hardcoreToggle) {
        refs.hardcoreToggle.onclick = () => {
          state.hardcore = !state.hardcore;
          if (state.hardcore && state.liveValidate) {
            state.liveValidate = false;
            refs.liveToggle.classList.remove('on');
          }
          refs.hardcoreToggle.classList.toggle('on', state.hardcore);
          paint();
          emitProgress();
        };
        refs.hardcoreToggle.onkeydown = (e) => {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); refs.hardcoreToggle.click(); }
        };
      }
      // Reflect any initial state in the toggle UI
      refs.liveToggle.classList.toggle('on', state.liveValidate);
      if (refs.hardcoreToggle) refs.hardcoreToggle.classList.toggle('on', state.hardcore);

      // Delegate clicks on the surrounding label/row to the switch itself.
      // Native <label for="X"> only delegates to form controls — our switches
      // are <div>s, so we have to wire it ourselves.
      bindToggleRow(refs.liveToggle);
      bindToggleRow(refs.hardcoreToggle);
    }

    function bindToggleRow(switchEl) {
      if (!switchEl) return;
      const row = switchEl.closest('.toggle-row');
      if (!row || row.dataset.bound === '1') return;
      row.dataset.bound = '1';
      row.style.cursor = 'pointer';
      row.addEventListener('click', (e) => {
        if (e.target === switchEl || switchEl.contains(e.target)) return;
        switchEl.click();
      });
      $$('.clues-tab').forEach(tab => {
        tab.onclick = () => setActiveTab(tab.dataset.dir);
      });
    }

    function destroy() {
      destroyKeyboard();
      clearInterval(state.timerInterval);
    }

    buildGrid();
    renderGrid();
    renderClues();
    bindUI();
    setupKeyboard();
    const first = state.words.filter(w => w.direction === 'across').sort((a, b) => a.num - b.num)[0]
              || state.words[0];
    if (first) activateWord(first.key);
    startTimer();
    paint();
    // First paint has populated solvedWordKeys from any restored state.
    // From here on, newly solved words trigger the flash animation.
    state.bootstrapped = true;

    return { destroy };
  }

  global.XwordEngine = { createGame };
})(typeof window !== 'undefined' ? window : globalThis);
