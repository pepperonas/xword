/**
 * Letter expansion for the puzzle alphabet.
 *
 * German crossword answers spell umlauts out: Ä→AE, Ö→OE, Ü→UE, ß→SS.
 * When the player types an umlaut on a hardware keyboard, this maps the
 * single character to the two ASCII letters the puzzle actually expects.
 *
 * Pure-data + pure-function module. No DOM. Used by engine.js at runtime
 * and exported as a global for `tests/letter-expand.test.js`.
 *
 * Capital ẞ (U+1E9E) is included alongside lowercase ß (U+00DF). The
 * lowercase form already uppercases to ẞ since Unicode 5.1 + ES2019, but
 * older browsers may still emit ß for `'ß'.toUpperCase()`; map both.
 */
(function (global) {
  'use strict';

  const UMLAUT_EXPANSION = Object.freeze({
    'Ä': 'AE',
    'Ö': 'OE',
    'Ü': 'UE',
    'ẞ': 'SS',
    'ß': 'SS',
  });

  /**
   * Expand a single typed character into the ASCII letter(s) the puzzle
   * expects. Always uppercase output. Non-letter input is returned as-is
   * (uppercased) so callers can filter via the surrounding regex check.
   *
   * @param {string} ch single character
   * @returns {string} 1- or 2-letter uppercase ASCII string
   */
  function expandLetter(ch) {
    if (typeof ch !== 'string' || ch.length === 0) return '';
    const u = ch.toUpperCase();
    return UMLAUT_EXPANSION[u] || u;
  }

  global.XwordLetterExpand = { expandLetter, UMLAUT_EXPANSION };
})(typeof window !== 'undefined' ? window : globalThis);
