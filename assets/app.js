/**
 * App Shell
 *
 *  - Loads puzzle manifest
 *  - Renders selector view (filterable, grouped by difficulty)
 *  - Switches to game view on puzzle pick
 *  - Hash routing: #play=<id>
 */

(function () {
  'use strict';

  const DIFFICULTY_LABELS = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };
  const DIFFICULTY_ORDER = ['easy', 'medium', 'hard'];

  const refs = {
    viewSelector: document.getElementById('view-selector'),
    viewGame: document.getElementById('view-game'),
    filterBar: document.getElementById('filterBar'),
    puzzleSections: document.getElementById('puzzleSections'),
    btnBack: document.getElementById('btnBack'),
    gameTitle: document.getElementById('gameTitle'),
    gameDescription: document.getElementById('gameDescription'),
    gameTheme: document.getElementById('gameTheme'),
    gameDifficulty: document.getElementById('gameDifficulty'),
    gamePills: document.getElementById('gamePills'),
    // engine refs
    root: document.getElementById('view-game'),
    grid: document.getElementById('grid'),
    boardMeta: document.getElementById('boardMeta'),
    hiddenInput: document.getElementById('hiddenInput'),
    currentBadge: document.getElementById('currentBadge'),
    currentText: document.getElementById('currentText'),
    btnCheck: document.getElementById('btnCheck'),
    btnHint: document.getElementById('btnHint'),
    btnReveal: document.getElementById('btnReveal'),
    btnReset: document.getElementById('btnReset'),
    btnPlayAgain: document.getElementById('btnPlayAgain'),
    btnBackFromWin: document.getElementById('btnBackFromWin'),
    liveToggle: document.getElementById('liveToggle'),
    statPercent: document.getElementById('statPercent'),
    statSolved: document.getElementById('statSolved'),
    statTotal: document.getElementById('statTotal'),
    statTime: document.getElementById('statTime'),
    statHints: document.getElementById('statHints'),
    progressFill: document.getElementById('progressFill'),
    countAcross: document.getElementById('countAcross'),
    countDown: document.getElementById('countDown'),
    cluesAcross: document.getElementById('cluesAcross'),
    cluesDown: document.getElementById('cluesDown'),
    overlay: document.getElementById('overlay'),
    winTime: document.getElementById('winTime'),
    winHints: document.getElementById('winHints'),
    winWords: document.getElementById('winWords'),
    confetti: document.getElementById('confetti'),
  };

  const state = {
    manifest: null,
    activeFilter: 'all',
    currentGame: null,
  };

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------- Loading ---------- */
  async function loadManifest() {
    const res = await fetch('puzzles/index.json');
    if (!res.ok) throw new Error('Manifest konnte nicht geladen werden: ' + res.status);
    return await res.json();
  }

  async function loadPuzzle(file) {
    const res = await fetch('puzzles/' + file);
    if (!res.ok) throw new Error('Rätsel konnte nicht geladen werden: ' + file);
    return await res.json();
  }

  /* ---------- Selector view ---------- */
  function renderFilters() {
    refs.filterBar.replaceChildren();
    const themes = ['all', ...new Set(state.manifest.puzzles.map(p => p.theme))];
    themes.forEach(theme => {
      const chip = el('button', 'filter-chip', theme === 'all' ? 'Alle' : theme);
      if (theme === state.activeFilter) chip.classList.add('active');
      chip.addEventListener('click', () => {
        state.activeFilter = theme;
        renderFilters();
        renderPuzzleList();
      });
      refs.filterBar.appendChild(chip);
    });
  }

  function renderPuzzleList() {
    refs.puzzleSections.replaceChildren();
    const filtered = state.activeFilter === 'all'
      ? state.manifest.puzzles
      : state.manifest.puzzles.filter(p => p.theme === state.activeFilter);

    if (filtered.length === 0) {
      const empty = el('div', 'empty-state', 'Keine Rätsel in dieser Kategorie.');
      refs.puzzleSections.appendChild(empty);
      return;
    }

    DIFFICULTY_ORDER.forEach(diff => {
      const items = filtered.filter(p => p.difficulty === diff);
      if (items.length === 0) return;

      const heading = el('div', 'section-heading');
      heading.appendChild(el('span', null, DIFFICULTY_LABELS[diff]));
      heading.appendChild(el('span', 'count', `${items.length} Rätsel`));
      refs.puzzleSections.appendChild(heading);

      const grid = el('div', 'puzzle-grid');
      items.forEach(p => grid.appendChild(buildPuzzleCard(p)));
      refs.puzzleSections.appendChild(grid);
    });
  }

  function buildPuzzleCard(p) {
    const card = el('div', 'puzzle-card');
    card.addEventListener('click', () => navigateToGame(p.id));

    const head = el('div', 'puzzle-card-head');
    head.appendChild(el('span', 'theme-tag', p.theme));
    head.appendChild(el('span', `difficulty ${p.difficulty}`, DIFFICULTY_LABELS[p.difficulty]));
    card.appendChild(head);

    card.appendChild(el('h3', null, p.title));
    card.appendChild(el('p', null, p.description || ''));

    const foot = el('div', 'puzzle-card-foot');
    foot.appendChild(el('span', null, `${p.wordCount || '—'} Wörter`));
    foot.appendChild(el('span', null, p.size ? `${p.size} × ${p.size}` : '—'));
    card.appendChild(foot);

    return card;
  }

  /* ---------- Game view ---------- */
  async function startGame(puzzleMeta) {
    let raw;
    try {
      raw = await loadPuzzle(puzzleMeta.file);
    } catch (err) {
      alert('Fehler beim Laden des Rätsels:\n' + err.message);
      return;
    }

    // If words don't have positions, compute layout
    let puzzle;
    const firstWord = raw.words[0];
    if (firstWord && typeof firstWord.row === 'number' && typeof firstWord.col === 'number' && firstWord.direction) {
      puzzle = { size: raw.size || autoSize(raw.words), words: raw.words };
    } else {
      const laid = window.XwordLayout.layout(raw.words);
      if (laid.unplaced.length > 0) {
        console.warn('Konnten nicht alle Wörter platziert werden:', laid.unplaced.map(w => w.answer));
      }
      puzzle = { size: laid.size, words: laid.words };
    }

    // Tear down previous game
    if (state.currentGame) state.currentGame.destroy();

    // Update header
    refs.gameTitle.textContent = puzzleMeta.title;
    refs.gameDescription.textContent = puzzleMeta.description || '';
    refs.gameTheme.textContent = puzzleMeta.theme;
    refs.gameDifficulty.textContent = DIFFICULTY_LABELS[puzzleMeta.difficulty] || puzzleMeta.difficulty;
    refs.gamePills.replaceChildren();
    refs.gamePills.appendChild(el('span', 'pill', puzzleMeta.theme));
    refs.gamePills.appendChild(el('span', 'pill', DIFFICULTY_LABELS[puzzleMeta.difficulty] || puzzleMeta.difficulty));
    refs.gamePills.appendChild(el('span', 'pill', `${puzzle.words.length} Wörter`));

    // Show game view
    refs.viewSelector.classList.remove('active');
    refs.viewGame.classList.add('active');
    refs.overlay.classList.remove('show');
    window.scrollTo({ top: 0, behavior: 'instant' });

    state.currentGame = window.XwordEngine.createGame(puzzle, refs, {
      onBack: () => navigateToSelector(),
    });
  }

  function autoSize(words) {
    let max = 0;
    words.forEach(w => {
      const r = w.direction === 'across' ? w.row : w.row + w.answer.length - 1;
      const c = w.direction === 'across' ? w.col + w.answer.length - 1 : w.col;
      if (r > max) max = r;
      if (c > max) max = c;
    });
    return max + 1;
  }

  function showSelector() {
    if (state.currentGame) {
      state.currentGame.destroy();
      state.currentGame = null;
    }
    refs.viewGame.classList.remove('active');
    refs.viewSelector.classList.add('active');
    refs.overlay.classList.remove('show');
  }

  /* ---------- Routing ---------- */
  function navigateToGame(puzzleId) {
    window.location.hash = `play=${puzzleId}`;
  }
  function navigateToSelector() {
    window.location.hash = '';
  }

  function onHashChange() {
    const hash = window.location.hash.replace(/^#/, '');
    const m = hash.match(/^play=(.+)$/);
    if (m) {
      const id = m[1];
      const puzzle = state.manifest.puzzles.find(p => p.id === id);
      if (puzzle) {
        startGame(puzzle);
        return;
      }
    }
    showSelector();
  }

  /* ---------- Init ---------- */
  async function init() {
    try {
      state.manifest = await loadManifest();
    } catch (err) {
      refs.puzzleSections.replaceChildren(
        el('div', 'empty-state',
          'Manifest konnte nicht geladen werden.\n' +
          'Hinweis: Diese App benötigt einen lokalen HTTP-Server.\n' +
          'Starte z.B. mit: python3 -m http.server 8000')
      );
      console.error(err);
      return;
    }
    renderFilters();
    renderPuzzleList();
    refs.btnBack.addEventListener('click', () => navigateToSelector());
    window.addEventListener('hashchange', onHashChange);
    onHashChange();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
