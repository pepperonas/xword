/**
 * xword-api — Google OAuth + per-user crossword progress storage.
 *
 * Endpoints:
 *   GET  /api/auth/google       Redirect to Google OAuth consent screen
 *   GET  /api/auth/callback     OAuth callback; sets session cookie
 *   POST /api/auth/logout       Clears session cookie
 *   GET  /api/auth/me           Current user (or 401)
 *   GET  /api/progress          List all progress entries for current user
 *   GET  /api/progress/:id      Single puzzle progress
 *   PUT  /api/progress/:id      Upsert progress for a puzzle
 *
 * Run:  node server.js   (reads ./.env automatically if NODE_ENV != production)
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { openDb } from './db.js';
import { sign, verify } from './session.js';

/* ------- Env loading (minimal dotenv) ------- */
function loadEnv() {
  const file = process.env.ENV_FILE || './.env';
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}
loadEnv();

const PORT = parseInt(process.env.PORT || '4242', 10);
const HOST = process.env.HOST || '127.0.0.1';
const DB_PATH = process.env.DB_PATH || './data/xword.db';
const CLIENT_ID = required('GOOGLE_CLIENT_ID');
const CLIENT_SECRET = required('GOOGLE_CLIENT_SECRET');
const REDIRECT_URI = required('OAUTH_REDIRECT_URI');
const APP_ORIGIN = required('APP_ORIGIN');
const SESSION_SECRET = required('SESSION_SECRET');
const SESSION_COOKIE = process.env.SESSION_COOKIE || 'xword_session';
const SESSION_TTL = parseInt(process.env.SESSION_TTL || '2592000', 10);
const STATE_COOKIE = 'xword_oauth_state';
const STATE_TTL = 600; // 10 minutes

function required(name) {
  const v = process.env[name];
  if (!v || v.startsWith('your-') || v.includes('replace-')) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const db = openDb(DB_PATH);
const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

/* ------- Auth middleware ------- */
function requireUser(req, res, next) {
  const token = req.cookies[SESSION_COOKIE];
  const payload = verify(token, SESSION_SECRET);
  if (!payload || !payload.uid) return res.status(401).json({ error: 'unauthenticated' });
  const user = db.getUserById.get(payload.uid);
  if (!user) return res.status(401).json({ error: 'user_gone' });
  req.user = user;
  next();
}

function cookieOpts(maxAgeSeconds) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  };
}

/* ------- OAuth start ------- */
app.get('/api/auth/google', (req, res) => {
  const state = randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, { ...cookieOpts(STATE_TTL), sameSite: 'lax' });

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  res.redirect(url.toString());
});

/* ------- OAuth callback ------- */
app.get('/api/auth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(APP_ORIGIN + '/?auth_error=' + encodeURIComponent(String(error)));
    if (!code || !state) return res.status(400).send('Missing code or state');

    const cookieState = req.cookies[STATE_COOKIE];
    if (!cookieState || cookieState !== state) return res.status(400).send('State mismatch');
    res.clearCookie(STATE_COOKIE, { path: '/' });

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.id_token) {
      console.error('Token exchange failed:', tokens);
      return res.status(502).send('Token exchange failed');
    }

    // Verify ID token via Google tokeninfo (server-to-server, no JWKS needed)
    const infoRes = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(tokens.id_token));
    const info = await infoRes.json();
    if (!infoRes.ok || info.aud !== CLIENT_ID || !info.sub || !info.email) {
      console.error('Token verification failed:', info);
      return res.status(502).send('Token verification failed');
    }

    // Upsert user
    const now = Math.floor(Date.now() / 1000);
    const user = db.upsertUser.get({
      google_sub: info.sub,
      email: info.email,
      name: info.name || info.email.split('@')[0],
      picture: info.picture || null,
      now,
    });

    // Issue session cookie
    const exp = now + SESSION_TTL;
    const session = sign({ uid: user.id, exp }, SESSION_SECRET);
    res.cookie(SESSION_COOKIE, session, cookieOpts(SESSION_TTL));

    res.redirect(APP_ORIGIN + '/');
  } catch (err) {
    console.error('Callback error:', err);
    res.status(500).send('Internal error');
  }
});

/* ------- Logout ------- */
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

/* ------- Who am I ------- */
app.get('/api/auth/me', requireUser, (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    picture: req.user.picture,
  });
});

/* ------- Progress endpoints ------- */
app.get('/api/progress', requireUser, (req, res) => {
  const rows = db.listProgress.all(req.user.id);
  res.json({ items: rows });
});

app.get('/api/progress/:puzzleId', requireUser, (req, res) => {
  const row = db.getProgress.get(req.user.id, req.params.puzzleId);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({
    puzzle_id: row.puzzle_id,
    grid_state: JSON.parse(row.grid_state),
    hinted_cells: JSON.parse(row.hinted_cells),
    hint_count: row.hint_count,
    elapsed_ms: row.elapsed_ms,
    solved: !!row.solved,
    solved_at: row.solved_at,
    updated_at: row.updated_at,
    percent: row.percent,
    hardcore: !!row.hardcore,
    live_validate: !!row.live_validate,
  });
});

// Both PUT (fetch) and POST (sendBeacon) are accepted. Beacon sends a Blob
// with content-type application/json, which Express body-parser handles
// transparently — so the handler is identical.
const saveProgressHandler = (req, res) => {
  const { grid_state, hinted_cells, hint_count, elapsed_ms, solved, percent, hardcore, live_validate } = req.body || {};
  if (!grid_state || typeof grid_state !== 'object') {
    return res.status(400).json({ error: 'invalid_grid_state' });
  }
  if (!Array.isArray(hinted_cells)) {
    return res.status(400).json({ error: 'invalid_hinted_cells' });
  }
  const now = Math.floor(Date.now() / 1000);
  db.upsertProgress.run({
    user_id: req.user.id,
    puzzle_id: req.params.puzzleId,
    grid_state: JSON.stringify(grid_state),
    hinted_cells: JSON.stringify(hinted_cells),
    hint_count: Math.max(0, parseInt(hint_count || 0, 10)),
    elapsed_ms: Math.max(0, parseInt(elapsed_ms || 0, 10)),
    solved: solved ? 1 : 0,
    solved_at: solved ? now : null,
    percent: Math.max(0, Math.min(100, parseInt(percent || 0, 10))),
    hardcore: hardcore ? 1 : 0,
    live_validate: live_validate ? 1 : 0,
    now,
  });
  res.json({ ok: true, updated_at: now });
};
app.put('/api/progress/:puzzleId', requireUser, saveProgressHandler);
app.post('/api/progress/:puzzleId', requireUser, saveProgressHandler);

/* ------- Health ------- */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.listen(PORT, HOST, () => {
  console.log(`[xword-api] listening on http://${HOST}:${PORT}`);
});
