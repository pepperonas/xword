/**
 * Input action dedupe.
 *
 * Some virtual keyboards (Samsung S24 Ultra, iOS Safari, Gboard variants)
 * fire BOTH `keydown` AND `beforeinput` for the same physical Backspace
 * press, and `document.activeElement` is briefly unreliable during the
 * first interaction so we cannot tell them apart by focus state. This
 * module returns a small dedupe predicate keyed on action+value: any
 * identical action within `windowMs` is treated as a duplicate and
 * silently dropped.
 *
 * The returned function takes an optional `now` argument so tests can
 * drive it deterministically without mocking Date.now().
 */
(function (global) {
  'use strict';

  function createDedupe(windowMs) {
    if (!(windowMs >= 0)) {
      throw new TypeError('createDedupe: windowMs must be a non-negative number');
    }
    let lastKey = null;
    let lastTs = -Infinity;
    return function dedupe(key, now) {
      const t = typeof now === 'number' ? now : Date.now();
      const dt = t - lastTs;
      // dt < 0 means the clock jumped backwards (paused tab, NTP correction).
      // Treat as "outside window" so we don't suppress legitimate events.
      if (key === lastKey && dt >= 0 && dt < windowMs) return false;
      lastKey = key;
      lastTs = t;
      return true;
    };
  }

  global.XwordInputDedupe = { createDedupe };
})(typeof window !== 'undefined' ? window : globalThis);
