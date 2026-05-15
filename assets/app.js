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
    viewAdmin: document.getElementById('view-admin'),
    filterBar: document.getElementById('filterBar'),
    puzzleSections: document.getElementById('puzzleSections'),
    btnBack: document.getElementById('btnBack'),
    btnAdminBack: document.getElementById('btnAdminBack'),
    adminTabs: document.getElementById('adminTabs'),
    adminContent: document.getElementById('adminContent'),
    userBarSelector: document.getElementById('userBarSelector'),
    userBarGame: document.getElementById('userBarGame'),
    userBarAdmin: document.getElementById('userBarAdmin'),
    settingsOverlay: document.getElementById('settingsOverlay'),
    settingsClose: document.getElementById('settingsClose'),
    settingsAccount: document.getElementById('settingsAccount'),
    settingsResetProgress: document.getElementById('settingsResetProgress'),
    settingsDeleteAccount: document.getElementById('settingsDeleteAccount'),
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
    hardcoreToggle: document.getElementById('hardcoreToggle'),
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
    saver: null,                   // { save, flushBeacon } from XwordAuth.makeSaver()
    currentPuzzleId: null,
    syncIndicator: null,           // DOM element shown while saving
    progressMap: {},               // puzzle_id -> { percent, solved, hint_count, elapsed_ms, ... }
    adminTab: 'users',
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

  async function loadVersion() {
    try {
      const res = await fetch('version.json', { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
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

      const settingsBtn = document.createElement('button');
      settingsBtn.textContent = 'Einstellungen';
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.remove('open');
        openSettings();
      });
      menu.appendChild(settingsBtn);

      if (state.user.is_admin) {
        const adminBtn = document.createElement('button');
        adminBtn.className = 'menu-admin';
        adminBtn.textContent = '★ Admin';
        adminBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          menu.classList.remove('open');
          navigateToAdmin();
        });
        menu.appendChild(adminBtn);
      }

      const divider = document.createElement('div');
      divider.className = 'user-menu-row divider';
      menu.appendChild(divider);

      const logoutBtn = document.createElement('button');
      logoutBtn.textContent = 'Abmelden';
      logoutBtn.addEventListener('click', async () => {
        await window.XwordAuth.logout();
        state.user = null;
        renderAllUserBars();
        navigateToSelector();
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
    if (refs.userBarAdmin) renderUserBar(refs.userBarAdmin);
  }

  /* ---------- Settings modal ---------- */
  function openSettings() {
    if (!state.user) return;
    refs.settingsAccount.replaceChildren();
    const avatar = el('span', 'settings-account-avatar');
    if (state.user.picture) avatar.style.backgroundImage = 'url(' + JSON.stringify(state.user.picture) + ')';
    const text = el('div', 'settings-account-text');
    text.appendChild(el('span', 'name', state.user.name || state.user.email));
    text.appendChild(document.createTextNode(state.user.email));
    refs.settingsAccount.appendChild(avatar);
    refs.settingsAccount.appendChild(text);
    refs.settingsOverlay.classList.add('show');
  }
  function closeSettings() { refs.settingsOverlay.classList.remove('show'); }

  /* ---------- Admin view ---------- */
  function navigateToAdmin() { window.location.hash = 'admin'; }
  function showAdmin() {
    if (state.currentGame) {
      state.currentGame.destroy();
      state.currentGame = null;
    }
    refs.viewSelector.classList.remove('active');
    refs.viewGame.classList.remove('active');
    refs.viewAdmin.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'instant' });
    renderUserBar(refs.userBarAdmin);
    setAdminTab(state.adminTab || 'users');
  }
  function setAdminTab(tab) {
    state.adminTab = tab;
    $$All(refs.adminTabs, '.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    refs.adminContent.replaceChildren(el('div', 'admin-loading', 'Lade Daten…'));
    renderAdminTab(tab);
  }

  function $$All(root, sel) { return root ? root.querySelectorAll(sel) : []; }

  function formatDuration(ms) {
    const total = Math.floor((ms || 0) / 1000);
    if (total < 60) return total + 's';
    const m = Math.floor(total / 60);
    if (m < 60) return m + ' Min';
    const h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm';
  }
  function formatTimestamp(unixSeconds) {
    if (!unixSeconds) return '—';
    const d = new Date(unixSeconds * 1000);
    return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }
  function formatBytes(n) {
    if (!n) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0, v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return v.toFixed(1) + ' ' + units[i];
  }

  async function renderAdminTab(tab) {
    const root = refs.adminContent;
    root.replaceChildren(el('div', 'admin-loading', 'Lade Daten…'));
    if (tab === 'users') {
      const data = await window.XwordAuth.adminFetch('users');
      if (!data) return root.replaceChildren(el('div', 'admin-error', 'Daten konnten nicht geladen werden.'));
      root.replaceChildren(buildUsersTable(data.items));
    } else if (tab === 'activity') {
      const data = await window.XwordAuth.adminFetch('activity');
      if (!data) return root.replaceChildren(el('div', 'admin-error', 'Daten konnten nicht geladen werden.'));
      root.replaceChildren(buildActivityTable(data.items));
    } else if (tab === 'puzzles') {
      const [puzzles, stats] = await Promise.all([
        window.XwordAuth.adminFetch('puzzles'),
        window.XwordAuth.adminFetch('stats'),
      ]);
      if (!puzzles || !stats) return root.replaceChildren(el('div', 'admin-error', 'Daten konnten nicht geladen werden.'));
      root.replaceChildren(buildPuzzleStats(puzzles.items, stats));
    } else if (tab === 'system') {
      const [system, stats] = await Promise.all([
        window.XwordAuth.adminFetch('system'),
        window.XwordAuth.adminFetch('stats'),
      ]);
      if (!system || !stats) return root.replaceChildren(el('div', 'admin-error', 'Daten konnten nicht geladen werden.'));
      root.replaceChildren(buildSystemView(system, stats));
    }
  }

  function buildUsersTable(items) {
    const wrap = el('div', 'admin-table-wrap');
    if (!items.length) { wrap.appendChild(el('div', 'admin-loading', 'Noch keine Spieler registriert.')); return wrap; }
    const table = document.createElement('table');
    table.className = 'admin-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '';
    const trh = document.createElement('tr');
    ['Spieler', 'Versucht', 'Gelöst', 'Spielzeit', 'Hints', 'Erst gesehen', 'Zuletzt aktiv'].forEach(h => {
      const th = document.createElement('th'); th.textContent = h; trh.appendChild(th);
    });
    thead.appendChild(trh); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const u of items) {
      const tr = document.createElement('tr');
      const td0 = document.createElement('td');
      const ucell = el('div', 'user-cell');
      const av = el('span', 'user-cell-avatar');
      if (u.picture) av.style.backgroundImage = 'url(' + JSON.stringify(u.picture) + ')';
      ucell.appendChild(av);
      const namebox = document.createElement('div');
      namebox.appendChild(el('span', 'name', u.name || u.email));
      namebox.appendChild(el('span', 'small', u.email));
      ucell.appendChild(namebox);
      td0.appendChild(ucell); tr.appendChild(td0);
      tr.appendChild(el('td', null, String(u.puzzles_attempted)));
      tr.appendChild(el('td', null, String(u.puzzles_solved)));
      tr.appendChild(el('td', null, formatDuration(u.total_time_ms)));
      tr.appendChild(el('td', null, String(u.total_hints)));
      tr.appendChild(el('td', null, formatTimestamp(u.created_at)));
      tr.appendChild(el('td', null, formatTimestamp(u.last_seen_at)));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function puzzleTitle(id) {
    if (!state.manifest) return id;
    const p = state.manifest.puzzles.find(x => x.id === id);
    return p ? p.title : id;
  }

  function buildActivityTable(items) {
    const wrap = el('div', 'admin-table-wrap');
    if (!items.length) { wrap.appendChild(el('div', 'admin-loading', 'Noch keine Aktivität.')); return wrap; }
    const table = document.createElement('table');
    table.className = 'admin-table';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Spieler', 'Rätsel', 'Fortschritt', 'Zeit', 'Hints', 'Status', 'Aktualisiert'].forEach(h => {
      const th = document.createElement('th'); th.textContent = h; trh.appendChild(th);
    });
    thead.appendChild(trh); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const a of items) {
      const tr = document.createElement('tr');
      const td0 = document.createElement('td');
      const ucell = el('div', 'user-cell');
      const av = el('span', 'user-cell-avatar');
      if (a.picture) av.style.backgroundImage = 'url(' + JSON.stringify(a.picture) + ')';
      ucell.appendChild(av);
      const namebox = document.createElement('div');
      namebox.appendChild(el('span', 'name', a.name || a.email));
      namebox.appendChild(el('span', 'small', a.email));
      ucell.appendChild(namebox);
      td0.appendChild(ucell); tr.appendChild(td0);
      tr.appendChild(el('td', null, puzzleTitle(a.puzzle_id)));
      tr.appendChild(el('td', null, a.percent + '%'));
      tr.appendChild(el('td', null, formatDuration(a.elapsed_ms)));
      tr.appendChild(el('td', null, String(a.hint_count)));
      const tdStatus = document.createElement('td');
      if (a.solved) {
        const b = el('span', 'solved-badge', '✓ Gelöst');
        tdStatus.appendChild(b);
      } else {
        tdStatus.textContent = '—';
      }
      tr.appendChild(tdStatus);
      tr.appendChild(el('td', null, formatTimestamp(a.updated_at)));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function buildPuzzleStats(items, stats) {
    const root = document.createDocumentFragment();
    const grid = el('div', 'admin-stat-grid');
    grid.appendChild(buildStatCell('Aktive Rätsel', state.manifest ? state.manifest.puzzles.length : '—'));
    grid.appendChild(buildStatCell('Versuche gesamt', stats.total_progress));
    grid.appendChild(buildStatCell('Lösungen', stats.total_solved));
    grid.appendChild(buildStatCell('Solve-Rate', stats.total_progress ? Math.round(100 * stats.total_solved / stats.total_progress) + '%' : '—'));
    root.appendChild(grid);

    const wrap = el('div', 'admin-table-wrap');
    const table = document.createElement('table');
    table.className = 'admin-table';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Rätsel', 'Versuche', 'Gelöst', 'Ø Fortschritt', 'Ø Zeit', 'Ø Hints', 'Beste Zeit'].forEach(h => {
      const th = document.createElement('th'); th.textContent = h; trh.appendChild(th);
    });
    thead.appendChild(trh); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const p of items) {
      const tr = document.createElement('tr');
      tr.appendChild(el('td', null, puzzleTitle(p.puzzle_id)));
      tr.appendChild(el('td', null, String(p.attempts)));
      tr.appendChild(el('td', null, String(p.solves)));
      tr.appendChild(el('td', null, (p.avg_percent || 0) + '%'));
      tr.appendChild(el('td', null, formatDuration(p.avg_time_ms)));
      tr.appendChild(el('td', null, String(p.avg_hints)));
      tr.appendChild(el('td', null, p.best_time_ms ? formatDuration(p.best_time_ms) : '—'));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    root.appendChild(wrap);
    return root;
  }

  function buildStatCell(label, value, sub) {
    const cell = el('div', 'admin-stat-cell');
    cell.appendChild(el('div', 'admin-stat-label', label));
    const v = el('div', 'admin-stat-value');
    v.appendChild(document.createTextNode(String(value)));
    if (sub) v.appendChild(el('span', 'sub', sub));
    cell.appendChild(v);
    return cell;
  }

  function buildSystemView(system, stats) {
    const root = document.createDocumentFragment();
    const grid = el('div', 'admin-stat-grid');
    grid.appendChild(buildStatCell('User', stats.total_users));
    grid.appendChild(buildStatCell('Aktiv (7 Tage)', stats.active_users_7d));
    grid.appendChild(buildStatCell('Uptime', formatDuration(system.uptime_seconds * 1000)));
    grid.appendChild(buildStatCell('Speicher', system.memory_mb + ' MB'));
    grid.appendChild(buildStatCell('DB-Größe', formatBytes(system.db_size_bytes)));
    grid.appendChild(buildStatCell('Node', system.node_version));
    root.appendChild(grid);

    const section = el('div', 'admin-section');
    section.appendChild(el('h3', null, 'Details'));
    const kv = el('div', 'admin-key-value');
    const addKV = (k, v) => {
      const row = el('div', 'admin-key-value-row');
      row.appendChild(el('span', 'k', k));
      row.appendChild(el('span', 'v', v));
      kv.appendChild(row);
    };
    addKV('Boot Time', formatTimestamp(Math.floor(system.boot_time / 1000)));
    addKV('Admin-Emails', system.admin_emails.join(', '));
    addKV('Spielzeit gesamt', formatDuration(stats.total_time_ms));
    addKV('Hints gesamt', String(stats.total_hints));
    section.appendChild(kv);
    root.appendChild(section);
    return root;
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
    const totalCount = state.manifest.puzzles.length;
    themes.forEach(theme => {
      const label = theme === 'all' ? 'Alle' : theme;
      const count = theme === 'all' ? totalCount : state.manifest.puzzles.filter(p => p.theme === theme).length;
      const chip = el('button', 'filter-chip');
      chip.appendChild(document.createTextNode(label));
      chip.appendChild(el('span', 'filter-chip-count', ' (' + count + ')'));
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

    // Progress (only if logged in AND user has touched this puzzle)
    const prog = state.progressMap[p.id];
    if (prog) {
      const wrap = el('div', 'puzzle-card-progress');
      const bar = el('div', 'puzzle-card-progress-bar' + (prog.solved ? ' solved' : ''));
      const fill = document.createElement('span');
      if (!prog.solved) fill.style.right = (100 - (prog.percent || 0)) + '%';
      bar.appendChild(fill);
      const label = el('div', 'puzzle-card-progress-label' + (prog.solved ? ' solved' : ''));
      if (prog.solved) {
        label.appendChild(el('span', null, '✓ Gelöst'));
        label.appendChild(el('span', null, formatHms(prog.elapsed_ms || 0)));
      } else {
        label.appendChild(el('span', null, (prog.percent || 0) + '% gelöst'));
        label.appendChild(el('span', null, formatHms(prog.elapsed_ms || 0)));
      }
      wrap.appendChild(bar);
      wrap.appendChild(label);
      card.appendChild(wrap);
    }

    const foot = el('div', 'puzzle-card-foot');
    foot.appendChild(el('span', null, `${p.wordCount || '—'} Wörter`));
    foot.appendChild(el('span', null, p.size ? `${p.size} × ${p.size}` : '—'));
    card.appendChild(foot);

    return card;
  }

  function formatHms(ms) {
    const total = Math.floor(ms / 1000);
    const m = String(Math.floor(total / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  async function refreshProgressMap() {
    if (!state.user) { state.progressMap = {}; return; }
    const items = await window.XwordAuth.listProgress();
    state.progressMap = {};
    if (items) {
      for (const it of items) state.progressMap[it.puzzle_id] = it;
    }
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
      state.saver = window.XwordAuth.makeSaver();
      callbacks.onProgressChange = (payload) => {
        showSyncIndicator('saving');
        state.saver.save(puzzleMeta.id, payload, () => showSyncIndicator('saved'));
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

  async function showSelector() {
    if (state.currentGame) {
      state.currentGame.destroy();
      state.currentGame = null;
    }
    state.currentPuzzleId = null;
    refs.viewGame.classList.remove('active');
    if (refs.viewAdmin) refs.viewAdmin.classList.remove('active');
    refs.viewSelector.classList.add('active');
    refs.overlay.classList.remove('show');
    // Refresh progress map so cards reflect latest state from the just-left game
    if (state.user) {
      await refreshProgressMap();
      renderPuzzleList();
    }
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
    if (hash === 'admin') {
      if (state.user && state.user.is_admin) {
        showAdmin();
      } else {
        window.location.hash = '';
      }
      return;
    }
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
    // Fetch user + manifest + version in parallel
    const [user, manifest, version] = await Promise.all([
      window.XwordAuth.fetchMe(),
      loadManifest().catch(err => { console.error(err); return null; }),
      loadVersion(),
    ]);
    state.user = user;
    state.manifest = manifest;

    const versionEl = document.getElementById('appVersion');
    if (versionEl) {
      versionEl.textContent = version && version.version ? 'Ver. ' + version.version : 'Ver. dev';
      if (version && version.commit) versionEl.title = version.commit + ' · ' + version.date;
    }

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

    // Pre-load progress so cards show percentages on first paint
    if (state.user) await refreshProgressMap();

    renderFilters();
    renderPuzzleList();
    refs.btnBack.addEventListener('click', () => navigateToSelector());
    if (refs.btnAdminBack) refs.btnAdminBack.addEventListener('click', () => navigateToSelector());

    // Admin tabs
    if (refs.adminTabs) {
      refs.adminTabs.querySelectorAll('.admin-tab').forEach(t => {
        t.addEventListener('click', () => setAdminTab(t.dataset.tab));
      });
    }

    // Settings modal handlers
    refs.settingsClose.addEventListener('click', closeSettings);
    refs.settingsOverlay.addEventListener('click', (e) => {
      if (e.target === refs.settingsOverlay) closeSettings();
    });
    refs.settingsResetProgress.addEventListener('click', async () => {
      if (!confirm('Wirklich ALLE Spielstände unwiderruflich zurücksetzen?')) return;
      const ok = await window.XwordAuth.resetAllProgress();
      if (ok) {
        state.progressMap = {};
        renderPuzzleList();
        closeSettings();
        alert('Spielstände gelöscht.');
      } else {
        alert('Fehler beim Löschen.');
      }
    });
    refs.settingsDeleteAccount.addEventListener('click', async () => {
      if (!confirm('Konto + alle Daten unwiderruflich löschen?\nDieser Schritt kann nicht rückgängig gemacht werden.')) return;
      const ok = await window.XwordAuth.deleteAccount();
      if (ok) {
        state.user = null;
        state.progressMap = {};
        renderAllUserBars();
        renderPuzzleList();
        closeSettings();
        alert('Konto gelöscht.');
      } else {
        alert('Fehler beim Löschen.');
      }
    });

    window.addEventListener('hashchange', onHashChange);

    // Flush pending save via sendBeacon when the tab is about to be hidden/closed.
    // `pagehide` is more reliable than `beforeunload` on iOS/Safari.
    const flushOnHide = () => {
      if (state.saver && state.currentPuzzleId) {
        state.saver.flushBeacon(state.currentPuzzleId);
      }
    };
    window.addEventListener('pagehide', flushOnHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushOnHide();
    });

    onHashChange();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
