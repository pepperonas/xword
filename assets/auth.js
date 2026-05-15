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

  /**
   * Immediate saver with a tiny coalescing window (60ms) to swallow keystroke bursts.
   * Tracks the most recent payload per puzzleId so flushPending() can sendBeacon
   * the final state on tab close.
   */
  function makeSaver(minIntervalMs = 60) {
    const pending = {};   // puzzleId -> latest payload (in-flight or queued)
    const inFlight = {};  // puzzleId -> bool
    const timers = {};    // puzzleId -> timer id

    async function flushOne(puzzleId, onSaved) {
      if (inFlight[puzzleId]) return;            // a save is already running; it will pick up the latest payload
      const payload = pending[puzzleId];
      if (!payload) return;
      inFlight[puzzleId] = true;
      try {
        const ok = await saveProgress(puzzleId, payload);
        if (typeof onSaved === 'function') onSaved(ok);
        // If a newer payload landed during the request, save it next.
        if (pending[puzzleId] && pending[puzzleId] !== payload) {
          // schedule another flush with the latest
          inFlight[puzzleId] = false;
          setTimeout(() => flushOne(puzzleId, onSaved), 0);
          return;
        }
        delete pending[puzzleId];
      } catch (e) {
        if (typeof onSaved === 'function') onSaved(false);
      } finally {
        inFlight[puzzleId] = false;
      }
    }

    function save(puzzleId, payload, onSaved) {
      pending[puzzleId] = payload;
      if (timers[puzzleId]) clearTimeout(timers[puzzleId]);
      timers[puzzleId] = setTimeout(() => {
        timers[puzzleId] = null;
        flushOne(puzzleId, onSaved);
      }, minIntervalMs);
    }

    /** Synchronous fire-and-forget send for `pagehide` — won't be aborted by tab close. */
    function flushBeacon(puzzleId) {
      const payload = pending[puzzleId];
      if (!payload) return false;
      if (!navigator.sendBeacon) return false;
      try {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        return navigator.sendBeacon(API + '/progress/' + encodeURIComponent(puzzleId), blob);
      } catch {
        return false;
      }
    }

    return { save, flushBeacon };
  }

  async function listProgress() {
    try {
      const res = await fetch(API + '/progress', { credentials: 'same-origin' });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error('list ' + res.status);
      const data = await res.json();
      return data.items || [];
    } catch (e) {
      console.warn('Progress list failed:', e);
      return null;
    }
  }

  async function resetAllProgress() {
    try {
      const res = await fetch(API + '/progress', { method: 'DELETE', credentials: 'same-origin' });
      return res.ok;
    } catch { return false; }
  }

  async function deleteAccount() {
    try {
      const res = await fetch(API + '/auth/me', { method: 'DELETE', credentials: 'same-origin' });
      return res.ok;
    } catch { return false; }
  }

  async function fetchProfile() {
    try {
      const res = await fetch(API + '/profile', { credentials: 'same-origin' });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error('profile ' + res.status);
      return await res.json();
    } catch (e) {
      console.warn('Profile fetch failed:', e);
      return null;
    }
  }

  async function adminFetch(path) {
    try {
      const res = await fetch(API + '/admin/' + path, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('admin/' + path + ' ' + res.status);
      return await res.json();
    } catch (e) {
      console.warn('Admin fetch failed:', e);
      return null;
    }
  }

  global.XwordAuth = {
    fetchMe,
    startLogin,
    logout,
    getProgress,
    saveProgress,
    listProgress,
    makeSaver,
    resetAllProgress,
    deleteAccount,
    adminFetch,
    fetchProfile,
  };
})(typeof window !== 'undefined' ? window : globalThis);
