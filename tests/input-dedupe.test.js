/**
 * Unit tests for assets/input-dedupe.js
 *
 * Covers the regression that prompted this module: virtual keyboards
 * on S24 Ultra (and iOS Safari) fire both `keydown` AND `beforeinput`
 * for the same Backspace press, causing two deleteLetter() calls and
 * removing two letters on the very first press. The dedupe predicate
 * must drop the second event when both arrive within the window.
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

require(path.join(__dirname, '..', 'assets', 'input-dedupe.js'));
const { createDedupe } = globalThis.XwordInputDedupe;

describe('createDedupe', () => {
  test('lets the first action through', () => {
    const fresh = createDedupe(60);
    assert.equal(fresh('delete:', 1000), true);
  });

  test('drops duplicate within window', () => {
    const fresh = createDedupe(60);
    assert.equal(fresh('delete:', 1000), true);
    assert.equal(fresh('delete:', 1030), false);
  });

  test('lets duplicate through after window expires', () => {
    const fresh = createDedupe(60);
    assert.equal(fresh('delete:', 1000), true);
    assert.equal(fresh('delete:', 1061), true);
  });

  test('lets different keys through even within window', () => {
    const fresh = createDedupe(60);
    assert.equal(fresh('type:A', 1000), true);
    assert.equal(fresh('type:B', 1010), true);
    assert.equal(fresh('delete:', 1020), true);
  });

  test('regression: S24 Ultra Backspace double-fire is collapsed to one', () => {
    // Both keydown(Backspace) and beforeinput(deleteContentBackward)
    // arrive in the same task. They both call dispatchAction('delete'),
    // which calls dedupe('delete:'). Only one should pass.
    const fresh = createDedupe(60);
    const KEY = 'delete:';
    assert.equal(fresh(KEY, 5000), true, 'first event (keydown) must pass');
    assert.equal(fresh(KEY, 5002), false, 'second event 2ms later (beforeinput) must drop');
    assert.equal(fresh(KEY, 5040), false, 'still inside window at 40ms must drop');
    assert.equal(fresh(KEY, 5061), true, '61ms later — user pressed again — must pass');
  });

  test('regression: rapid same-letter typing still works after window', () => {
    // 10 chars/sec ≈ 100ms apart; even very fast typists rarely break the
    // 60ms window. We must not block legitimate fast repeats.
    const fresh = createDedupe(60);
    assert.equal(fresh('type:A', 0), true);
    assert.equal(fresh('type:A', 100), true);  // 10 chars/sec same letter
    assert.equal(fresh('type:A', 200), true);
  });

  test('uses Date.now() when no timestamp is provided', () => {
    const fresh = createDedupe(60);
    assert.equal(fresh('delete:'), true);
    // Calling again immediately without a timestamp should drop.
    assert.equal(fresh('delete:'), false);
  });

  test('each instance has independent state', () => {
    const a = createDedupe(60);
    const b = createDedupe(60);
    assert.equal(a('delete:', 1000), true);
    assert.equal(b('delete:', 1000), true, 'second instance is not aware of first');
  });

  test('rejects invalid windowMs', () => {
    assert.throws(() => createDedupe(-1), TypeError);
    assert.throws(() => createDedupe('not a number'), TypeError);
    assert.throws(() => createDedupe(NaN), TypeError);
  });

  test('window of 0 disables deduping', () => {
    const fresh = createDedupe(0);
    assert.equal(fresh('delete:', 1000), true);
    assert.equal(fresh('delete:', 1000), true, 'identical timestamp at window=0 still passes');
  });

  test('clock going backwards does not break the predicate', () => {
    // Belt-and-suspenders: a paused tab or clock skew could in principle
    // produce decreasing timestamps. The predicate should still answer
    // sensibly (let it through) rather than getting stuck in a state.
    const fresh = createDedupe(60);
    assert.equal(fresh('delete:', 1000), true);
    assert.equal(fresh('delete:', 500), true, 'earlier timestamp is treated as "outside window"');
  });
});
