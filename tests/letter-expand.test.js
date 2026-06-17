/**
 * Unit tests for assets/letter-expand.js
 *
 * The puzzle alphabet is ASCII A–Z; umlauts (Ä Ö Ü ß) must be expanded
 * to their conventional two-letter spelling before they hit the grid,
 * or a player who types Ä on a German keyboard will never solve a word
 * that contains AE.
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

require(path.join(__dirname, '..', 'assets', 'letter-expand.js'));
const { expandLetter, UMLAUT_EXPANSION } = globalThis.XwordLetterExpand;

describe('expandLetter', () => {
  test('passes ASCII A–Z through unchanged (upper case)', () => {
    assert.equal(expandLetter('A'), 'A');
    assert.equal(expandLetter('M'), 'M');
    assert.equal(expandLetter('Z'), 'Z');
  });

  test('upper-cases lowercase ASCII', () => {
    assert.equal(expandLetter('a'), 'A');
    assert.equal(expandLetter('z'), 'Z');
  });

  test('expands lowercase umlauts to two ASCII letters', () => {
    assert.equal(expandLetter('ä'), 'AE');
    assert.equal(expandLetter('ö'), 'OE');
    assert.equal(expandLetter('ü'), 'UE');
  });

  test('expands uppercase umlauts to two ASCII letters', () => {
    assert.equal(expandLetter('Ä'), 'AE');
    assert.equal(expandLetter('Ö'), 'OE');
    assert.equal(expandLetter('Ü'), 'UE');
  });

  test('expands ß and ẞ to SS', () => {
    assert.equal(expandLetter('ß'), 'SS');
    assert.equal(expandLetter('ẞ'), 'SS');
  });

  test('returns empty string for empty / non-string input', () => {
    assert.equal(expandLetter(''), '');
    assert.equal(expandLetter(null), '');
    assert.equal(expandLetter(undefined), '');
    assert.equal(expandLetter(42), '');
  });

  test('output is always uppercase', () => {
    // Spot-check every entry in the table.
    for (const [input, expected] of Object.entries(UMLAUT_EXPANSION)) {
      assert.equal(expected, expected.toUpperCase(),
        `${input} → ${expected} should already be upper`);
    }
  });

  test('the expansion table is the documented set, no surprises', () => {
    // Pin the contract: which characters expand. Anything outside this
    // set must pass through. If we ever want to add more (e.g., Œ from
    // a French loanword puzzle), the test will flag it loudly.
    const keys = Object.keys(UMLAUT_EXPANSION).sort();
    assert.deepEqual(keys, ['Ä', 'Ö', 'Ü', 'ß', 'ẞ'].sort());
  });

  test('the expansion of each umlaut matches the puzzle convention', () => {
    // The "Ä → AE" rule is announced in the clue-panel legend and
    // expected by every puzzle JSON. Pin both sides so they can't drift.
    assert.equal(UMLAUT_EXPANSION['Ä'], 'AE');
    assert.equal(UMLAUT_EXPANSION['Ö'], 'OE');
    assert.equal(UMLAUT_EXPANSION['Ü'], 'UE');
    assert.equal(UMLAUT_EXPANSION['ß'], 'SS');
    assert.equal(UMLAUT_EXPANSION['ẞ'], 'SS');
  });

  test('non-letter unicode is returned uppercased (defensive)', () => {
    // The engine pre-filters with a regex, so this never fires in
    // practice, but: any single character we pass in must come back.
    assert.equal(expandLetter('1'), '1');
    assert.equal(expandLetter('!'), '!');
    assert.equal(expandLetter('€'), '€');
  });
});
