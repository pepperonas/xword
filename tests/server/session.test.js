/**
 * Tests for server/session.js — HMAC-signed cookies.
 */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// session.js is ESM; load via dynamic import.
async function loadSession() {
  return await import(path.join('..', '..', 'server', 'session.js'));
}

describe('session.sign / session.verify', () => {
  test('roundtrip recovers payload', async () => {
    const { sign, verify } = await loadSession();
    const token = sign({ uid: 42, exp: 9999999999 }, 'secret');
    const payload = verify(token, 'secret');
    assert.equal(payload.uid, 42);
    assert.equal(payload.exp, 9999999999);
  });

  test('wrong secret returns null', async () => {
    const { sign, verify } = await loadSession();
    const token = sign({ uid: 1, exp: 9999999999 }, 'correct-secret');
    assert.equal(verify(token, 'different-secret'), null);
  });

  test('tampered body returns null', async () => {
    const { sign, verify } = await loadSession();
    const token = sign({ uid: 1, exp: 9999999999 }, 'secret');
    const [body, sig] = token.split('.');
    // Flip a char in the body — signature won't match anymore.
    const tampered = body.slice(0, -1) + (body.endsWith('A') ? 'B' : 'A') + '.' + sig;
    assert.equal(verify(tampered, 'secret'), null);
  });

  test('tampered signature returns null', async () => {
    const { sign, verify } = await loadSession();
    const token = sign({ uid: 1, exp: 9999999999 }, 'secret');
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    assert.equal(verify(tampered, 'secret'), null);
  });

  test('expired token returns null', async () => {
    const { sign, verify } = await loadSession();
    const token = sign({ uid: 1, exp: Math.floor(Date.now() / 1000) - 60 }, 'secret');
    assert.equal(verify(token, 'secret'), null);
  });

  test('missing exp is accepted (no expiry)', async () => {
    const { sign, verify } = await loadSession();
    const token = sign({ uid: 1 }, 'secret');
    const payload = verify(token, 'secret');
    assert.ok(payload);
    assert.equal(payload.uid, 1);
  });

  test('malformed input returns null', async () => {
    const { verify } = await loadSession();
    assert.equal(verify('', 'secret'), null);
    assert.equal(verify(null, 'secret'), null);
    assert.equal(verify('not-a-token', 'secret'), null);
    assert.equal(verify('a.b.c', 'secret'), null);
  });
});
