# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: xword

A self-contained crossword puzzle framework with AI-powered puzzle generation, Google login, per-user progress, achievements, ranks, daily challenges, an admin panel, and a PWA offline mode.

**Live**: https://xword.celox.io · **GitHub**: https://github.com/pepperonas/xword

---

## High-level architecture

Three roles, deployed independently:

| | Where | What |
|---|---|---|
| **Static SPA** | `/var/www/xword.celox.io/` on VPS, served by nginx | `index.html` + `assets/` + `puzzles/` JSON + legal pages |
| **Backend** | `/opt/xword-api/` on VPS, systemd service `xword-api`, listens on 127.0.0.1:4242, nginx proxies `/api/` to it | Google OAuth, sessions, per-user progress, achievements, admin endpoints |
| **Generator CLI** | local Mac only, `generator/` | Calls Claude API to create new puzzle JSONs |

The frontend is **rein statisch** — no build step, no bundler, no framework. Plain HTML/CSS/JS. The backend is **Node.js + Express + better-sqlite3** in ES-module form.

### Frontend layers

```
index.html        — SPA shell with 4 views: selector, game, profile, admin
assets/
  styles.css      — theme variables + all UI styles, light + dark
  layout.js       — crossword auto-layout algorithm (browser + node)
  engine.js       — game engine: grid render, input, timer, hardcore mode
  auth.js         — API client wrapper (fetch, sendBeacon, makeSaver)
  app.js          — view routing, state, all UI rendering, theme manager
```

Views are toggled via hash routing: `#play=<id>`, `#admin`, `#profile`, or none (selector).

### Backend layers

```
server/
  server.js              — Express app, routes, env loading
  db.js                  — SQLite schema + prepared statements + migrations
  session.js             — HMAC-signed cookie helpers
  rate-limit.js          — per-IP fixed-window counter middleware
  manifest.js            — TTL-cached read of puzzles/index.json
  achievements.js        — rank tiers + achievement defs + computeProfile
  scripts/backup.sh      — daily SQLite snapshot (gzip, 14-day rotation)
  xword-api.service      — systemd unit for the backend
  xword-backup.service   — oneshot for the backup script
  xword-backup.timer     — daily 03:00 trigger
```

### Puzzles

```
puzzles/
  index.json             — manifest: array of { id, file, title, theme,
                            difficulty, description, wordCount, size }
  <theme-difficulty-NN>.json  — one puzzle each
```

Two valid puzzle JSON forms:

1. **Pre-laid-out**: includes `size` and per-word `row/col/direction` (production)
2. **Words only**: `[{ answer, clue }]` — `app.js` runs `XwordLayout.layout()` at load time (manual prototypes)

Currently 12 shipped puzzles, 10 themes (tech, allgemein, klassik, mythologie, wissenschaft, kunst, geographie, architektur, sport, musik), 3 difficulties (easy / medium / hard).

---

## Database schema

SQLite at `/opt/xword-api/data/xword.db`, WAL mode, foreign keys on.

```sql
users:
  id PK, google_sub UNIQUE, email, name, picture, created_at, last_seen_at

progress:
  user_id FK, puzzle_id, grid_state JSON, hinted_cells JSON,
  hint_count, elapsed_ms, solved, solved_at, updated_at,
  percent, hardcore, live_validate,
  solved_in_hardcore, solved_no_hints,    -- captured ONCE at first solve
  PK (user_id, puzzle_id)
```

`solved_in_hardcore` and `solved_no_hints` are written *only at first solve* via `CASE WHEN @solved = 1 THEN @hardcore END` + `COALESCE` on upsert — they never get rewritten if the user later toggles the mode off, so achievements stay sticky.

Migrations run automatically on startup (`migrateProgress` in `db.js` checks `PRAGMA table_info` and adds missing columns with `ALTER TABLE ADD COLUMN`). Backwards compatible with older DBs.

---

## Auth model

- **OAuth flow**: Authorization Code with PKCE-style state cookie. Server-side exchange via `/api/auth/callback`, ID-token verified through Google's `tokeninfo` endpoint (no JWKS lib needed).
- **Session**: HMAC-SHA256 signed cookie `xword_session` containing `{ uid, exp }`, HttpOnly + Secure + SameSite=Lax. 30-day TTL.
- **Admin**: derived from `ADMIN_EMAILS` env var (comma-separated). Server is the only source of truth — never trust client claims. `is_admin: true` is added to `/api/auth/me` output for the UI.

---

## Auto-layout constraints

The algorithm in `assets/layout.js` enforces standard crossword rules:

- Crossings must share the same letter.
- Non-crossing cells of a new word must not have parallel-adjacent filled cells (would create unintended 2-letter words).
- The cells immediately before/after a word's endpoints must be empty (no word extension).
- T-junctions are legal: two parallel down-words may both cross the same across-word at adjacent columns.

Scoring (`scoreCandidate`): `crossings² × 500 + crossings × 50 − distance_to_center` — multi-crossing placements are quadratically preferred.

`attemptLayout` runs up to ~80–120 randomised passes with different seed orderings; if some words can't be placed, the best partial layout wins.

---

## Achievement + rank system

- **12 achievements** with Bronze/Silver/Gold tiers. Computed live from progress data — no separate state to track.
- **7 ranks** in newspaper aesthetic: Lesefuchs → Tintenkleckser → Federführer → Setzer → Lektor → Chefredakteur → Eminenz.
- **XP** = solved-puzzle base (easy 5, medium 15, hard 30) + achievement-tier bonus (10 / 25 / 50).
- **Streak** = consecutive UTC days with ≥1 solve. Today's not solved? Yesterday-only solve still counts as "live" streak.
- **Daily challenge** = deterministic puzzle-of-the-day via `mulberry32(yyyymmdd)` mod manifest length.

---

## Toast notification flow

When a save flips a puzzle to `solved=true`:

1. `app.js` re-fetches `/api/profile` server-side
2. Compares each `unlocked: true` achievement against `localStorage['xword.seenAchievements']`
3. For each *new* unlock: spawns a toast with a 400 ms stagger
4. Toast auto-dismisses after 4.5 s

On first page load, the diff is taken silently to baseline — no toast spam for old unlocks.

---

## Versioning

`scripts/bump-version.sh` reads `git rev-list --count HEAD` and writes `version.json`:

```json
{ "version": 15, "commit": "fa1fa2f", "date": "2026-05-15" }
```

The frontend fetches it on init and shows "Ver. N" in the masthead eyebrow. `version.json` is gitignored — always regenerated on deploy. The hover-title shows commit hash + date for debugging.

---

## PWA / offline

- `manifest.webmanifest`: `display: standalone`, theme/background colors, icons (svg + png).
- `sw.js` (cache version `xword-v3`, bump when shipping app-shell changes):
  - App shell → stale-while-revalidate (`SHELL_CACHE`)
  - Puzzle JSONs → network-first, cache fallback (`PUZZLE_CACHE`)
  - Google Fonts → cache-first opaque (`FONTS_CACHE`)
  - `/api/*` → **never cached** (auth-sensitive)
- Registered only on `https:` to avoid local-dev confusion.

---

## Security posture (deployed on xword.celox.io)

- **HSTS**: `max-age=31536000; includeSubDomains` (preload eligible)
- **CSP**: strict `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (`'unsafe-inline'` needed for JS-driven `element.style.*` mutations), `img-src 'self' data: lh3/*.googleusercontent.com`, `frame-ancestors 'none'`
- **X-Frame-Options**: DENY
- **Permissions-Policy**: deny camera, microphone, geolocation, payment, usb, sensors
- **Cross-Origin-Opener-Policy**: same-origin
- **Rate limits**: `/api/auth/*` 20/min, `/api/progress*` 300/min, `/api/*` 240/min — all per IP
- **Session cookie**: HttpOnly, Secure, SameSite=Lax
- **OAuth state**: CSRF defence with short-lived state cookie compared on callback

---

## Development commands

```bash
# Run tests (no deps — uses node:test built into Node ≥ 18)
npm test                       # or: node --test tests/

# Run the SPA locally (required — fetch() needs http:// not file://)
npm run serve                  # or: python3 -m http.server 8000

# Generate version.json from the current Git state
npm run version:bump

# Build production-minified assets into dist/ (esbuild). ~45% smaller, ~33% less on-wire.
npm run build

# Bake auto-layout into a words-only JSON (deterministic positions afterward)
node -e "
require('./assets/layout.js');
const fs = require('fs');
const p = require('./puzzles/<name>.json');
const r = globalThis.XwordLayout.layout(p.words);
p.size = r.size;
p.words = r.words.map(w => ({ answer: w.answer, clue: w.clue, row: w.row, col: w.col, direction: w.direction }));
fs.writeFileSync('./puzzles/<name>.json', JSON.stringify(p, null, 2));
"

# Generate a new puzzle via Claude API
cd generator && npm install
node generate.js --theme tech --difficulty medium --words 16

# Dry-run the generator without an API key (uses stub word list)
node generator/generate.js --theme tech --difficulty easy --words 10 --dry --output /tmp/test.json
```

---

## Deployment

Two rsync targets:

```bash
# Backend (when server/ changed)
cd /Users/martin/claude/xword/server
rsync -avz --exclude='node_modules' --exclude='data' --exclude='.env' \
  ./ root@69.62.121.168:/opt/xword-api/
ssh root@69.62.121.168 'systemctl restart xword-api && systemctl is-active xword-api'

# Frontend production deploy (recommended): build into dist/, rsync dist/.
cd /Users/martin/claude/xword
npm test && npm run build && rsync -avz --delete dist/ \
  root@69.62.121.168:/var/www/xword.celox.io/
ssh root@69.62.121.168 'chown -R root:root /var/www/xword.celox.io && chmod -R u=rwX,go=rX /var/www/xword.celox.io'

# Frontend quick deploy (unminified, useful for iteration):
cd /Users/martin/claude/xword
npm run version:bump && rsync -avz --delete \
  --exclude='.git' --exclude='.gitignore' --exclude='.github' --exclude='generator' \
  --exclude='tests' --exclude='CLAUDE.md' --exclude='package.json' --exclude='dist' \
  --exclude='package-lock.json' --exclude='scripts' --exclude='server' \
  --exclude='node_modules' --exclude='.DS_Store' --exclude='.playwright-mcp' \
  ./ root@69.62.121.168:/var/www/xword.celox.io/
ssh root@69.62.121.168 'chown -R root:root /var/www/xword.celox.io && chmod -R u=rwX,go=rX /var/www/xword.celox.io'
```

---

## Backend environment

`/opt/xword-api/.env` on the VPS (mode 640, owned by root:www-data, **never** committed):

```env
PORT=4242
HOST=127.0.0.1
DB_PATH=/opt/xword-api/data/xword.db
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
APP_ORIGIN=https://xword.celox.io
OAUTH_REDIRECT_URI=https://xword.celox.io/api/auth/callback
SESSION_SECRET=<openssl rand -hex 32>
SESSION_COOKIE=xword_session
SESSION_TTL=2592000
ADMIN_EMAILS=martinpaush@gmail.com
MANIFEST_PATH=/var/www/xword.celox.io/puzzles/index.json
```

---

## Backups

systemd timer `xword-backup.timer` fires daily 03:00:

- Calls `/opt/xword-api/scripts/backup.sh`
- Runs `sqlite3 .backup` (consistent under concurrent writers, unlike `cp`)
- Gzips, writes to `/var/backups/xword/xword-YYYY-MM-DD.db.gz`
- Deletes files older than 14 days

Check status:
```bash
ssh root@69.62.121.168 'systemctl list-timers xword-backup.timer'
ssh root@69.62.121.168 'journalctl -u xword-backup --no-pager -n 20'
ssh root@69.62.121.168 'ls -lh /var/backups/xword/'
```

Restore:
```bash
scp root@69.62.121.168:/var/backups/xword/xword-YYYY-MM-DD.db.gz .
gunzip xword-YYYY-MM-DD.db.gz
sqlite3 xword-YYYY-MM-DD.db ".tables"
```

---

## Admin / settings

- Frontend dropdown shows **Profil** + **Einstellungen** for any logged-in user, **★ Admin** only when `/api/auth/me` returns `is_admin: true`.
- Admin status is decided server-side from `ADMIN_EMAILS`. Never trust client claims.
- Admin endpoints (`/api/admin/*`) all go through `requireAdmin` middleware and are **read-only** by design (users, activity, puzzle stats, system info).
- Settings modal: theme switcher (Hell / Dunkel / System), `DELETE /api/progress` (reset own progress), `DELETE /api/auth/me` (delete account + cascade-delete progress).

---

## Theming

CSS variables defined under `:root` (light) and `html[data-theme="dark"]` (dark). `app.js` reads `localStorage['xword.theme']` (`light` / `dark` / `auto`) and sets the attribute on `<html>` at startup. `'auto'` honours `prefers-color-scheme` and reacts to OS changes mid-session.

---

## CI

GitHub Actions (`.github/workflows/test.yml`) runs `npm test` on push to `main` and PRs. The README Tests-Badge points at the workflow.

---

## Conventions

- All UI text is German.
- Answers are uppercase A–Z only, no spaces/punctuation. Umlauts get spelled out (`ä` → `AE`, `ö` → `OE`, `ü` → `UE`, `ß` → `SS`). UI legend in the clue panel explains this to players.
- Never use `innerHTML` with interpolated user/data content — use `replaceChildren()` + `createElement()`. (Build-time security hook enforces this.)
- The engine is stateless across puzzles — `destroy()` cleans up event listeners and timer; `app.js` always destroys the previous game before starting a new one.
- Toggles (live-validation, hardcore) are mutually exclusive. The whole `.toggle-row` is clickable (label-delegation is wired in `bindToggleRow`).

---

## Adding a new puzzle (quick reference)

1. Pick theme + difficulty.
2. Create `puzzles/<theme>-<difficulty>-NN.json`:
   ```json
   {
     "id": "<theme>-<difficulty>-NN",
     "title": "…",
     "theme": "<theme>",
     "difficulty": "easy|medium|hard",
     "description": "…",
     "words": [
       { "answer": "WORT", "clue": "Hinweis" }
     ]
   }
   ```
3. Bake the layout (see Development commands above).
4. Add an entry to `puzzles/index.json` with `wordCount` + `size`.
5. Extend the test regression list in `tests/layout.test.js`.
6. `npm test`, commit, push, rsync.

Achievements that need cross-theme coverage (`Bücherwurm`, `Polyglott`, `Bibliothekar`) reflect new themes automatically because they read the manifest at request time.

---

## Adding a new theme template for the generator

Two files:

- `generator/prompts/<theme>.md` — Mustache-style template with `{{count}}`, `{{difficulty}}`, `{{difficultyDe}}`, `{{theme}}` placeholders. Must instruct Claude to return a pure JSON array of `{answer, clue}` objects.
- (Optional) a sample puzzle in `puzzles/` so the theme appears in the selector before the generator is run.

The selector's filter bar enumerates themes from the manifest dynamically — no hardcoded list.
