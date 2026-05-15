/**
 * Tests for server/rate-limit.js — per-IP fixed-window counter.
 */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

async function loadRateLimit() {
  return await import(path.join('..', '..', 'server', 'rate-limit.js'));
}

function fakeReqRes(ip = '1.2.3.4') {
  const headers = {};
  const status = { code: 200, body: null };
  return [
    { headers: { 'x-forwarded-for': ip }, socket: { remoteAddress: ip } },
    {
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      status: (n) => { status.code = n; return this; },
      json: (b) => { status.body = b; },
      _headers: headers,
      _status: status,
    },
  ];
}

describe('rate-limit', () => {
  test('allows requests up to the limit', async () => {
    const { createLimiter } = await loadRateLimit();
    const guard = createLimiter({ windowMs: 60_000, max: 5 });
    for (let i = 0; i < 5; i++) {
      const [req, res] = fakeReqRes();
      let called = false;
      guard(req, res, () => { called = true; });
      assert.equal(called, true, `request ${i + 1} should pass`);
    }
  });

  test('blocks the request that exceeds the limit', async () => {
    const { createLimiter } = await loadRateLimit();
    const guard = createLimiter({ windowMs: 60_000, max: 3 });
    let nextCalls = 0;
    for (let i = 0; i < 4; i++) {
      const [req, res] = fakeReqRes('5.5.5.5');
      // Re-bind status/json to track on res for this scope
      res.status = function (n) { res._status.code = n; return res; };
      res.json = function (b) { res._status.body = b; };
      guard(req, res, () => { nextCalls++; });
      if (i < 3) {
        assert.equal(res._status.code, 200);
      } else {
        assert.equal(res._status.code, 429);
        assert.ok(res._status.body.retry_after > 0);
        assert.ok(res._headers['retry-after']);
      }
    }
    assert.equal(nextCalls, 3, 'next() called only for the first 3 requests');
  });

  test('rate-limit headers are set on every request', async () => {
    const { createLimiter } = await loadRateLimit();
    const guard = createLimiter({ windowMs: 60_000, max: 10 });
    const [req, res] = fakeReqRes('9.9.9.9');
    guard(req, res, () => {});
    assert.equal(res._headers['x-ratelimit-limit'], '10');
    assert.equal(res._headers['x-ratelimit-remaining'], '9');
  });

  test('different IPs have independent buckets', async () => {
    const { createLimiter } = await loadRateLimit();
    const guard = createLimiter({ windowMs: 60_000, max: 1 });
    let passA = 0, passB = 0;
    {
      const [req, res] = fakeReqRes('10.0.0.1');
      guard(req, res, () => passA++);
    }
    {
      const [req, res] = fakeReqRes('10.0.0.2');
      guard(req, res, () => passB++);
    }
    assert.equal(passA, 1);
    assert.equal(passB, 1);
  });
});
