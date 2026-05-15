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
    userBarSelector: document.getElementById('userBarSelector'),
    userBarGame: document.getElementById('userBarGame'),
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
    user: null,                    // {id, email, name, picture} or null
    saveProgress: null,            // debounced saver from XwordAuth
    currentPuzzleId: null,
    syncIndicator: null,           // DOM element shown while saving
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

  /* ---------- User bar ---------- */
  const GOOGLE_LOGO_PATHS = [
    ['#4285F4', 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'],
    ['#34A853', 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'],
    ['#FBBC05', 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'],
    ['#EA4335', 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'],
  ];

  function buildGoogleLogo() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    for (const [fill, d] of GOOGLE_LOGO_PATHS) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('fill', fill);
      p.setAttribute('d', d);
      svg.appendChild(p);
    }
    return svg;
  }

  function renderUserBar(container) {
    container.replaceChildren();
    if (state.user) {
      const wrap = document.createElement('div');
      wrap.style.position = 'relative';

      const chip = document.createElement('button');
      chip.className = 'user-chip';
      const avatar = document.createElement('span');
      avatar.className = 'user-avatar';
      if (state.user.picture) {
        avatar.style.backgroundImage = 'url(' + JSON.stringify(state.user.picture) + ')';
      }
      const name = document.createElement('span');
      name.className = 'user-name';
      name.textContent = state.user.name || state.user.email;
      chip.appendChild(avatar);
      chip.appendChild(name);
      wrap.appendChild(chip);

      const menu = document.createElement('div');
      menu.className = 'user-menu';
      const emailRow = document.createElement('div');
      emailRow.className = 'user-menu-row email';
      emailRow.textContent = state.user.email;
      menu.appendChild(emailRow);
      const syncRow = document.createElement('div');
      syncRow.className = 'user-menu-row';
      syncRow.textContent = '✓ Fortschritt wird gespeichert';
      menu.appendChild(syncRow);
      const logoutBtn = document.createElement('button');
      logoutBtn.textContent = 'Abmelden';
      logoutBtn.addEventListener('click', async () => {
        await window.XwordAuth.logout();
        state.user = null;
        renderAllUserBars();
      });
      menu.appendChild(logoutBtn);
      wrap.appendChild(menu);

      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('open');
      });
      document.addEventListener('click', () => menu.classList.remove('open'));

      container.appendChild(wrap);
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn-login-google';
      btn.appendChild(buildGoogleLogo());
      btn.appendChild(document.createTextNode('Anmelden'));
      btn.addEventListener('click', () => window.XwordAuth.startLogin());
      container.appendChild(btn);
    }
  }

  function renderAllUserBars() {
    renderUserBar(refs.userBarSelector);
    renderUserBar(refs.userBarGame);
  }

  function showSyncIndicator(status) {
    if (!state.syncIndicator) return;
    state.syncIndicator.classList.remove('saving', 'saved');
    if (status === 'saving') {
      state.syncIndicator.textContent = '↻ Speichere…';
      state.syncIndicator.classList.add('visible', 'saving');
    } else if (status === 'saved') {
      state.syncIndicator.textContent = '✓ Gespeichert';
      state.syncIndicator.classList.add('visible', 'saved');
      setTimeout(() => state.syncIndicator && state.syncIndicator.classList.remove('visible'), 1500);
    }
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
    state.currentPuzzleId = puzzleMeta.id;

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
    renderUserBar(refs.userBarGame);

    // Re-create sync indicator inside the back-bar
    state.syncIndicator = el('span', 'sync-indicator');
    refs.gamePills.appendChild(state.syncIndicator);

    // Load existing progress if logged in
    let initialState = null;
    if (state.user) {
      initialState = await window.XwordAuth.getProgress(puzzleMeta.id);
    }

    // Wire engine with progress callback (only when logged in)
    const callbacks = { onBack: () => navigateToSelector() };
    if (state.user) {
      const debouncedSaver = window.XwordAuth.makeDebouncedSaver(1500);
      callbacks.onProgressChange = (payload) => {
        showSyncIndicator('saving');
        debouncedSaver(puzzleMeta.id, payload, () => showSyncIndicator('saved'));
      };
      callbacks.initialState = initialState;
    }

    state.currentGame = window.XwordEngine.createGame(puzzle, refs, callbacks);
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
    // Fetch user + manifest in parallel
    const [user, manifest] = await Promise.all([
      window.XwordAuth.fetchMe(),
      loadManifest().catch(err => { console.error(err); return null; }),
    ]);
    state.user = user;
    state.manifest = manifest;

    renderAllUserBars();

    if (!state.manifest) {
      refs.puzzleSections.replaceChildren(
        el('div', 'empty-state',
          'Manifest konnte nicht geladen werden.\n' +
          'Hinweis: Diese App benötigt einen lokalen HTTP-Server.\n' +
          'Starte z.B. mit: python3 -m http.server 8000')
      );
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
