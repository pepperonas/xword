/**
 * Auth + API client.
 *   XwordAuth.fetchMe()        → user object or null
 *   XwordAuth.startLogin()     → navigates to Google OAuth flow
 *   XwordAuth.logout()         → clears server-side session
 *   XwordAuth.getProgress(id)  → progress object or null
 *   XwordAuth.saveProgress(id, payload) → save, debounced internally if used via saveProgressDebounced
 */
(function (global) {
  'use strict';

  const API = '/api';

  async function fetchMe() {
    try {
      const res = await fetch(API + '/auth/me', { credentials: 'same-origin' });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error('me failed: ' + res.status);
      return await res.json();
    } catch (e) {
      console.warn('Auth check failed:', e);
      return null;
    }
  }

  function startLogin() {
    window.location.href = API + '/auth/google';
  }

  async function logout() {
    await fetch(API + '/auth/logout', { method: 'POST', credentials: 'same-origin' });
  }

  async function getProgress(puzzleId) {
    try {
      const res = await fetch(API + '/progress/' + encodeURIComponent(puzzleId), { credentials: 'same-origin' });
      if (res.status === 401 || res.status === 404) return null;
      if (!res.ok) throw new Error('progress fetch ' + res.status);
      return await res.json();
    } catch (e) {
      console.warn('Progress load failed:', e);
      return null;
    }
  }

  async function saveProgress(puzzleId, payload) {
    try {
      const res = await fetch(API + '/progress/' + encodeURIComponent(puzzleId), {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch (e) {
      console.warn('Progress save failed:', e);
      return false;
    }
  }

  /** Debounced saver factory — keyed by puzzleId so different puzzles don't cancel each other.
   *  Returned function: (puzzleId, payload, onSaved?) — onSaved fires with bool success after the actual save. */
  function makeDebouncedSaver(delayMs = 1500) {
    const timers = {};
    return function (puzzleId, payload, onSaved) {
      if (timers[puzzleId]) clearTimeout(timers[puzzleId]);
      timers[puzzleId] = setTimeout(async () => {
        timers[puzzleId] = null;
        const ok = await saveProgress(puzzleId, payload);
        if (typeof onSaved === 'function') onSaved(ok);
      }, delayMs);
    };
  }

  global.XwordAuth = {
    fetchMe,
    startLogin,
    logout,
    getProgress,
    saveProgress,
    makeDebouncedSaver,
  };
})(typeof window !== 'undefined' ? window : globalThis);
