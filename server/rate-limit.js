/**
 * Lightweight per-IP rate limiter with a fixed-window counter.
 *
 * Keeps a Map<ip, { count, windowStart }>. Cleans entries lazily.
 * Not multi-process safe — fine for our single-instance Node service.
 *
 * Usage:
 *   const guard = createLimiter({ windowMs: 60_000, max: 60 });
 *   app.use('/api/auth', guard);
 */
export function createLimiter({ windowMs, max }) {
  const buckets = new Map();

  return function rateLimit(req, res, next) {
    const ip = clientIp(req);
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b || now - b.windowStart >= windowMs) {
      b = { count: 0, windowStart: now };
      buckets.set(ip, b);
    }
    b.count++;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - b.count)));
    if (b.count > max) {
      const retryAfter = Math.ceil((windowMs - (now - b.windowStart)) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'rate_limited', retry_after: retryAfter });
    }
    next();

    // Lazy cleanup: every 1000th hit, prune expired buckets to avoid unbounded growth.
    if ((buckets.size & 0x3ff) === 0) prune(buckets, now, windowMs);
  };
}

function prune(map, now, windowMs) {
  for (const [k, v] of map) {
    if (now - v.windowStart > windowMs * 2) map.delete(k);
  }
}

function clientIp(req) {
  // Behind nginx; trust X-Forwarded-For when set, fall back to socket.
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
