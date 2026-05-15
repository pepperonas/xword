/**
 * Lightweight HMAC-signed session cookies. No JWT library needed.
 *
 * Encoded as: base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)
 * The payload contains { uid, exp }.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

export function sign(payload, secret) {
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = b64urlEncode(createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verify(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64urlEncode(createHmac('sha256', secret).update(body).digest());
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
