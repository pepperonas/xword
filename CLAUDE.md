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
  input-dedupe.js — event dedupe predicate (mobile keyboard double-fire fix)
  qrcode.js       — Kazuhiko Arase's MIT QR generator (vendored, ~21 KB minified)
  dialog.js       — Xdialog.alert / Xdialog.confirm / Xdialog.show (M3-themed)
  engine.js       — game engine: grid render, input, timer, hardcore mode
  auth.js         — API client wrapper (fetch, sendBeacon, makeSaver)
  app.js          — view routing, state, all UI rendering, theme manager
  theme-init.js   — early dark/light apply for legal pages (CSP-safe extern)
```

Views are toggled via hash routing: `#play=<id>`, `#admin`, `#profile`, or none (selector).

### Backend layers

```
server/
  server.js              — Express app, routes, env loading
  db.js                  — SQLite schema + prepared statements + migrations entrypoint
  migrations.js          — declarative migration framework (additive ALTER TABLE)
  session.js             — HMAC-signed cookie helpers
  rate-limit.js          — per-IP fixed-window counter middleware
  manifest.js            — TTL-cached read of puzzles/index.json
  achievements.js        — rank tiers + achievement defs + computeProfile + computeStreak + dailyPuzzle
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

Currently 53 shipped puzzles, 18 themes (tech, allgemein, klassik, mythologie, wissenschaft, kunst, geographie, architektur, sport, musik, geschichte, film, natur, literatur, philosophie, religion, medizin, astronomie), 3 difficulties (easy / medium / hard). Distribution: **7 easy + 5 medium + 41 hard** (8 puzzles added 2026-05-19 to flatten the onboarding curve, which had been 2/2/26 before; 8 MINT/software hard puzzles added 2026-06-09 — `tech-hard-01..05`, `wissenschaft-hard-03..05` — turning tech into a 5-puzzle hard tier and giving wissenschaft a Math/Particle/Genetics triple; 7 cultural hard puzzles added 2026-06-09 — `mythologie-hard-03` (Edda), `literatur-hard-03` (Russen 19. Jh), `geschichte-hard-03` (Kalter Krieg), `film-hard-03` (Nouvelle Vague), `kunst-hard-03` (Moderne 20. Jh), `musik-hard-03` (Oper), `astronomie-hard-02` (Sternbilder & Phänomene)). Fifteen of the hard puzzles are tagged as "1-Mio-Niveau" — clue density at the level of the top prize question on the German "Wer wird Millionär" quiz show: `literatur-hard-01`, `literatur-hard-02`, `geschichte-hard-02`, `wissenschaft-hard-02`, `philosophie-hard-01`, `kunst-hard-02`, `musik-hard-02`, `geographie-hard-02`, `mythologie-hard-02`, `film-hard-02`, `architektur-hard-02`, `religion-hard-01`, `medizin-hard-01`, `astronomie-hard-01`, `sport-hard-02`.

---

## Per-puzzle share thumbnails (OG-image pipeline)

Sharing a puzzle URL on WhatsApp / Twitter / iMessage / Slack used to show
the generic landing-page card, because the SPA's hash routing
(`/#play=<id>`) is invisible to crawlers. Since 2026-06-14 every puzzle
has its own static share page and a custom-rendered 1200×630 PNG.

### URL shape

| URL | Who reads it | What's there |
|---|---|---|
| `https://xword.celox.io/share/<id>/` | Social crawler **and** human | Tiny HTML with puzzle-specific `og:*` + `twitter:*` + `Schema.org/Game` JSON-LD; `<meta http-equiv="refresh">` + `window.location.replace()` push humans straight into `/#play=<id>` |
| `https://xword.celox.io/og/<id>.png` | Social crawler only | Custom 1200×630 PNG with the puzzle title, theme chip, difficulty chip, description, and a sample-word mini-grid corner |

The Frontend share dialog (and the Win-Overlay share button) now use the
`/share/<id>/` URL whenever a puzzle is active. On the selector screen
(no puzzle yet) we still share the root URL.

### Generation pipeline (all build-time, all static output)

```
scripts/generate-og-images.mjs      → og/<id>.png
scripts/generate-share-pages.mjs    → share/<id>/index.html
```

Both are hooked into `scripts/build.sh` and exposed as `npm run
og:bump` / `share:bump` for ad-hoc regeneration. Inputs are only the
manifest plus the per-puzzle JSON.

- `og:` uses **satori + @resvg/resvg-js** (dev-deps only — no runtime
  load on the VPS). Layout follows the brand: dark M3 surface, primary
  blue + gold accent radial gradients, Inter ExtraBold for the headline,
  difficulty-coloured chip (`#2d6e4e` easy / `#c8a96a` medium / `#d97757`
  hard). Sample word is the longest 5-7 letter answer in the puzzle,
  rendered as crossword cells in the bottom-right corner.
- `share:` writes ~4 KB HTML per puzzle. Schema.org `Game` JSON-LD
  carries the localised theme + difficulty as `gameItem` + two
  `additionalProperty` entries. The HTML body shows a "Wird ins Rätsel
  weitergeleitet…" fallback with a direct deep-link button for the rare
  browsers that ignore both `<meta http-equiv="refresh">` and the
  inline JS redirect.

### Fonts

`scripts/fonts/Inter-{Regular,Bold,ExtraBold}.ttf` are committed
(~1.2 MB total). They're only needed for the build-time OG renderer,
never shipped to clients. Inter chosen for clean Latin coverage; the
runtime app still uses Roboto Serif / Flex / Mono.

### What's committed vs. gitignored

```
/og/          gitignored  — regenerated every build, ~6.7 MB total
/share/       gitignored  — regenerated every build, ~420 KB total
scripts/fonts/   committed  — needed for deterministic builds
puzzles/stats.json committed — shields.io reads it via raw.githubusercontent.com
```

### Cache-busting

Social cachers (WhatsApp/Facebook/LinkedIn) cache `og:image` per URL for
days. If the design changes substantively, append `?v=<n>` to the
`og:image` content in the share-page template — that's enough to force
re-scrape on next crawl. Otherwise the `Cache-Control` on the static
PNG (default-served by nginx) plus the next-day crawl re-fetch handle
it on their own.

### Gotchas we hit

- **Satori warns `z-index is currently not supported`** — harmless,
  layered absolute positioning still renders correctly. The two background
  gradient circles use explicit `position: absolute` + `top/left/right/bottom`
  and rely on natural document order for stacking.
- **No emoji glyphs in Inter.** All visual elements (brand square, chips)
  are CSS shapes, no emojis.
- **Satori needs `display: flex` on every container with multiple
  children.** A missing flex on a wrapper crashes the render. The text
  child of a flex container is wrapped in another `display: flex` div.
- **Mixed German quotes "„…&quot;" in `og:image:alt`** would round-trip
  ugly through `escape()`. Use Unicode opener `„` AND Unicode closer `"`,
  not the ASCII closer. The `tests/share-pages.test.js` test pins this.

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

`attemptLayout` runs up to **80** randomised passes by default (`opts.tries`, can be raised — the layout regression tests pass `{ tries: 200 }` for headroom). Later passes shuffle word order more aggressively and try alternative seed words from the top-K longest. If some words can't be placed, the best partial layout wins.

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

## Mobile keyboard input

Three quirks of virtual keyboards forced the input pipeline to be more elaborate than a desktop crossword would need:

1. **iOS Safari won't open the keyboard if the focused input is `display:none` or sits outside the viewport.** `.hidden-input` is therefore `position: fixed; top: 0; left: 0; width: 1px; height: 1px; opacity: 0; font-size: 16px`. The 16px font-size is essential — anything smaller triggers iOS auto-zoom-on-focus, after which the keyboard refuses to open.

2. **iOS Safari requires `.focus()` to be called synchronously inside a user-gesture handler.** The original `setTimeout(focusHiddenInput, 0)` in the document-level click handler broke this contract and the keyboard would close again immediately. Now synchronous.

3. **Empty inputs silently drop Backspace.** Mobile keyboards fire `beforeinput` / `input` only when there is content to delete. We keep a sentinel ` ` character in the input at all times and re-set it after every event — so the very first Backspace press fires properly.

4. **Some Android keyboards (Samsung S24 Ultra) fire both `keydown` *and* `beforeinput` for the same Backspace press**, and `document.activeElement` is briefly unreliable during the first interaction. `assets/input-dedupe.js` exports a `createDedupe(windowMs)` predicate keyed on action+value; any identical action within 60 ms is treated as a duplicate. All four entry points (`keydown`, `beforeinput`, `input` fallback, programmatic calls) go through the same gatekeeper. The dedupe module is pure and unit-tested (`tests/input-dedupe.test.js`).

---

## Versioning

`scripts/bump-version.sh` reads `git rev-list --count HEAD` and writes `version.json`:

```json
{ "version": 49, "commit": "9ec2ad4", "date": "2026-05-19" }
```

The frontend fetches it on init and shows "Ver. N" in the masthead eyebrow. `version.json` is gitignored — always regenerated on deploy (the build script runs `bump-version.sh` first). The hover-title shows commit hash + date for debugging.

---

## PWA / offline

- `manifest.webmanifest`: `display: standalone`, theme/background colors, icons (svg + png).
- `sw.js` (cache version `xword-v9`, bump when shipping app-shell changes — especially CSS, since stale-while-revalidate will otherwise serve last-cached styles.css for one more reload):
  - App shell → stale-while-revalidate (`SHELL_CACHE`)
  - Puzzle JSONs → network-first, cache fallback (`PUZZLE_CACHE`)
  - Google Fonts → cache-first opaque (`FONTS_CACHE`)
  - `/api/*` → **never cached** (auth-sensitive)
- Registered only on `https:` to avoid local-dev confusion.
- **Auto-reload on upgrade**: `app.js` snapshots the SW controller at boot and listens for `controllerchange`. If the page was already controlled and a new SW takes over (because the cache version got bumped), the page reloads exactly once so the in-memory JS gets replaced with the freshly cached version. First-time visitors (no previous controller) are not reloaded.

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
# Run tests (no root deps, but the server suites need better-sqlite3 from server/)
npm test                       # or: node --test tests/
cd server && npm install       # one-time, so the db.test.js / upsert.test.js suites can import server/db.js

# Run only one suite
node --test tests/layout.test.js
node --test tests/input-dedupe.test.js
node --test tests/server/

# Run the SPA locally (required — fetch() needs http:// not file://)
npm run serve                  # or: python3 -m http.server 8000

# Generate version.json from the current Git state (build script does this for you)
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

# Generate a new puzzle via Claude API (needs ANTHROPIC_API_KEY env)
export ANTHROPIC_API_KEY=sk-ant-…
cd generator && npm install
node generate.js --theme tech --difficulty medium --words 16

# Dry-run the generator without an API key (uses a stub word list)
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

Material Design 3 token system. Source color **#0B57D0** (deep indigo).
The full M3 color-role set (primary, secondary, tertiary, error, plus
surface containers lowest..highest) lives under `:root` (light) and
`html[data-theme="dark"]` (dark). `app.js` reads
`localStorage['xword.theme']` (`light` / `dark` / `auto`) and sets the
attribute on `<html>` at startup. `'auto'` honours `prefers-color-scheme`
and reacts to OS changes mid-session.

**Crossword cells use decoupled tokens** (`--xword-cell-bg`,
`--xword-cell-fg`, `--xword-active-bg`, `--xword-active-word-bg`,
`--xword-correct-bg`, ...). They intentionally keep cells *light* in
both modes — dark mode reads as "paper on a dark desk" rather than
inverting the grid, because letter cells remaining bright is the
strongest signal of where the player can type.

**Typography**: Roboto Serif (display, variable opsz/wght), Roboto Flex
(body, variable wght), Roboto Mono (code/stats). Material Symbols
Outlined is loaded for future icon swaps.

**Motion system (2026-06-16 craft pass)** — one timing vocabulary,
reused everywhere. Defined as CSS custom props on `:root`:

- Durations: `--xd-dur-fast 120ms` (hover/press), `--xd-dur-quick 200ms`
  (focus rings, small state changes), `--xd-dur-base 320ms` (card lifts,
  panel opens), `--xd-dur-page 480ms` (view transitions, overlay drops).
- Easings: `--ease-flat` (M3 emphasized, for opacity/color — fades that
  overshoot read as broken), `--ease-spring` (gentle overshoot+settle,
  for any spatial move), `--ease-spring-soft` (deeper overshoot for big
  moves), `--ease-anticipate` (counter-move before main move).

Reach for the next duration up only when the transition spans a bigger
distance. Don't define new easings ad-hoc — pick one of the four.

**`prefers-reduced-motion: reduce`** strictly clips all animation/
transition durations to 0.001ms, neutralises `puzzle-card` tilt
transforms, locks overlay cards at `scale(1)`, and hides the confetti.
Bake-in, not bolt-on — every new motion must survive this filter.

**Subtle animations**:
- M3 state-layer on buttons + filter chips (8/10/14% opacity overlays
  on hover/focus/press; +`scale(0.97-0.98)` on press)
- Letter `.type-in` (180ms scale-bounce on keystroke; engine.js applies
  the class via requestAnimationFrame after `paint()`)
- Letter `.hint-drop` (400ms drop+bounce when a hint reveals a letter)
- Active cell: persistent outer ring + soft glow shadow (no pulse)
- Cell hover tint (mouse-only via `(hover: hover) and (pointer: fine)`)
- Tab underline slides via `scaleX` between Horizontal/Vertikal
- `.sync-indicator.saving` pulses opacity 1↔0.55 at 1.2s
- Word-solve flash: gentle scale + glow pulse, staggered per cell when
  a word goes from incorrect → correct (engine.js, suppressed on the
  final word so the big solve-wave / win confetti carries that moment)

**Signature reactive moment — puzzle-card cursor tilt** (`setupCardTilt`
in `app.js`). Gated to `(hover: hover) and (pointer: fine)` and
disabled under reduced motion — touch users do not pay the perf cost.

- One delegated `pointermove` listener on `#puzzleSections`, one shared
  `requestAnimationFrame` loop. No per-card listeners. Re-renders of
  the card list need no re-binding.
- Each tracked card has `cur` / `vel` / `tgt` axis vectors. The frame
  loop integrates a damped spring (`K=0.18`, `damp=0.78`) so the card
  overshoots toward the target, then settles. Rigid 1:1 cursor tracking
  reads as computer-y; inertia + settle sells "object with mass".
- Output goes into `--tilt-x` / `--tilt-y` CSS vars on the card. The
  `.puzzle-card` transform composes them with the hover lift as a single
  3D matrix: `perspective(900px) rotateX(...) rotateY(...) translateY(...)`.
- Max 4° on either axis — anything more reads as a parlour trick.
- Settled cards remove themselves from the tracker so the rAF loop
  shuts down between gestures.

**Directional view transitions** (selector ↔ game ↔ profile ↔ admin)
use the View Transitions API as a **vertical print-stack metaphor** —
no horizontal motion, because horizontal slide reads as "window switch"
not "turning the page".

- Forward (deeper): old page recedes (scale 1 → 1.04, translateY -2%
  + fade) and stays IN FRONT (`z-index: 1`); the new page rises from
  below (translateY 4% → 0, scale 0.985 → 1) with spring overshoot
  BEHIND the old one — the physical print-stack metaphor (the next
  sheet lifts onto the stack as the previous is pushed away).
- Back: old falls IN FRONT (scale 1 → 0.985, translateY 3%, z-index
  2); new returns from slight push-back (scale 1.025 → 1, translateY
  -1.5% → 0).
- Common `transform-origin: 50% 30%` on both pseudos keeps them
  pivoting around the same anchor — otherwise scale-out grows the
  old pseudo instead of receding it.

`<html data-nav="forward|back">` switches which keyframe set runs.
Selectors use the direct-pseudo form
`html[data-nav="back"]::view-transition-old(root)` (no space),
because some engines don't match the descendant-with-space form for
view-transition pseudos.

`navigateToGame()` / `navigateToSelector()` set `data-nav` and flip a
`programmaticNav` flag before changing `location.hash`. The flag is
needed because **Blink/WebKit fire `popstate` as a side effect of
`location.hash = …`** — without the flag, my popstate listener would
treat every programmatic forward nav as a user-back and overwrite
data-nav back to 'back' a frame later, making every transition run
the back keyframes. The flag is consumed (`= false`) at the top of
`onHashChange` so the next real popstate is interpreted correctly.

**Do NOT** reset `data-nav` to `'forward'` in
`.finished.finally(...)` after a back transition. Doing so un-applies
the `html[data-nav="back"] .puzzle-grid { animation: none }`
suppression rule, which restarts the rise entrance animations on the
now-visible selector — looks like a hard refresh after the
transition. The lingering 'back' state between transitions is
harmless because nothing is animating.

On back-nav the "rise" entrance animations on `.masthead`,
`.puzzle-grid`, etc. are suppressed via `html[data-nav="back"]` — the
visitor is returning, not arriving (blueprint: don't replay
entrances on return).

`withViewTransition()` in `app.js` falls back to a direct call when
the API isn't available or `prefers-reduced-motion: reduce` is on.

**Scroll restoration** — `history.scrollRestoration = 'manual'` is set
in `assets/boot.js` (NOT inline — see CSP note below), so the browser
never animates a scroll-to-top during hash changes and doesn't try to
restore the previous scroll position itself. Without this, a back-nav
visibly SNAPS the scroll position right as the view-transition pseudos
detach, which reads as a hard refresh.

`navigateToGame()` stashes the selector's `scrollY` in
`scrollMemory.selector`; coming back the inner `showSelector()` resolves,
then we restore that position instantly. The restore runs INSIDE the
view-transition callback so it lands inside the new frame — no flicker
between transition end and scroll snap.

`showSelector()` also has a defensive scroll clamp at the end: if the
post-render `scrollY` exceeds the new selector's content height (e.g.
the game view was taller and the browser left scrollY beyond the new
range), it instantly snaps back into range so the visitor never lands
in empty space below the footer.

**CSP note** — the deployed CSP is `script-src 'self'` with no
`unsafe-inline` and no hash. An inline `<script>` in `<head>` is
**silently blocked** — no visible error in DevTools unless console is
filtered to "All". Anything that has to run before app.js / styles.css
parse (currently: `html.js` PE-marker, `scrollRestoration='manual'`,
the theme-init early dark/light apply on legal pages) lives in an
external file under `assets/`. If you add another pre-paint setting,
make a new external file or extend `boot.js` — never reach for inline
script.

**Focus model**:
- Global `*:focus-visible` ring uses the primary token plus a soft
  4-px halo (`box-shadow` with 22%-alpha primary). Pill-shaped
  controls (`.btn`, `.filter-chip`, `.user-chip`, `.theme-option`,
  `.back-link`, `.admin-tab`, `.clues-tab`) override the radius back
  to `--md-shape-full` so the ring follows the pill.
- The grid keeps its own focus model — `:focus-visible` is killed on
  `.cell` and the hidden input. The active-cell ring is the source of
  truth there.
- Dialogs / settings / win overlay all return focus to the trigger on
  close (`prevFocus.focus({ preventScroll: true })`).

**`text-wrap: balance`** applied to every display heading (`.masthead
h1`, `.win-card h2`, `.settings-head h2`, `.xdialog-title`, profile
section H2s, `.puzzle-card h3`, `.daily-card h2`, `.rank-banner-name`)
so titles never end on a widow word. `text-wrap: pretty` on body copy
(`.masthead .subtitle`, `.puzzle-card p`, `.daily-card .meta`,
`.empty-state`).

**Touch hover ghost-state fix** — `.puzzle-card:hover` (background
shift + box-shadow + `--tilt-lift: -3px`) sits inside `@media (hover:
hover) and (pointer: fine)`. Touch users no longer get a sticky lifted
card after a tap.

**Robustness — `body.scroll-locked`**: when ANY modal opens (Xdialog,
settings, win overlay) a refcounted scroll-lock stack adds the class to
`<body>` (`overflow: hidden`, `touch-action: none`). The page's
`scrollY` is saved before lock, restored after the last modal closes.
Stacked modals (settings → confirm) refcount correctly — the body lock
survives until the outermost modal closes. `scrollbar-gutter: stable
both-edges` on `<html>` reserves the scrollbar width so the lock toggle
causes no horizontal jump.

**Focus trap** — `dialog.js` exports a `trapFocus(container, e)` Tab
handler that cycles through all focusables inside the dialog card.
Wired into the keydown handler of both `Xdialog.alert/confirm` and
`Xdialog.show`. The settings overlay has its own equivalent trap inline
in `app.js` (separate code path because it lives in static HTML, not
generated by the dialog module).

**Progressive-enhancement marker** — `assets/boot.js` (loaded from
`<head>` before `styles.css`) adds `html.js` synchronously, before
styles parse. Utility classes `.js-only` / `.no-js-only` are gated by
it so no element can ever be stranded hidden when JS is off. The same
file also sets `history.scrollRestoration = 'manual'` (see Scroll
restoration above for why both must run pre-paint). External file,
not inline, because CSP `script-src 'self'` blocks inline scripts.

`boot.js` is in `APP_SHELL` of `sw.js` — anyone reading this file
after editing the boot script: bump the SW VERSION constant.

**Overlays — three classes share the `.overlay` backdrop**:
1. **Win overlay** (`#overlay > .win-card`) — shown via `engine.win()` when the
   final word completes, after the staggered solve-wave + confetti.
2. **Settings overlay** (`#settingsOverlay > .settings-card`) — toggled by the
   user menu; theme switcher, reset-progress, delete-account.
3. **Custom dialogs** (`.xdialog-overlay > .xdialog-card`) — dynamically
   created by `Xdialog.alert/confirm`, see below. Z-index 200 so they sit
   above the Settings overlay if both ever stack.

All three render their card via M3 surface tokens (`surface-container-high`
+ outline-variant + on-surface*), so light and dark themes work without any
extra rules. The backdrop is `--md-sys-color-scrim` with `backdrop-filter: blur(8px)`.

**Custom dialogs (no native browser alert/confirm)**: `assets/dialog.js`
exposes three Promise-based factories, all rendered with M3 surface
tokens so light and dark themes both work:

- `Xdialog.alert(message, opts?)` — single OK button
- `Xdialog.confirm(message, opts?)` — Cancel + OK (destructive option)
- `Xdialog.show({ title, body, closeLabel?, onClose? })` — custom DOM
  body for things like the QR share dialog. Returns `{ close() }`.

Options on alert/confirm: `{ title?, okLabel?, cancelLabel?,
destructive? }`. Destructive confirms focus the cancel button initially
so an accidental Enter does not commit. Esc cancels, backdrop click
cancels, Enter confirms unless focus is on Cancel. Action row is
horizontal (M3 pill buttons, 40 px height, min-width 96 px); outlined
cancel + filled primary, or filled `--md-sys-color-error` for
destructive.

**Share dialog** (`openShareDialog` in `app.js`): triggered from the
user-dropdown "App teilen" entry. Builds an SVG QR code via
`window.qrcode` (vendored Kazuhiko Arase library) targeting
`https://xword.celox.io/`, plus a "Link kopieren" button and — on
browsers that expose `navigator.share` — a native-share button.
QR canvas stays light-bg in both themes (scanner reliability).

**Button class conventions**: `.btn-danger` is **colour-only**
(error-container tonal background) — it does not impose width or
margin. Layouts that want stacked, full-width destructive buttons
(currently only the Settings drawer) opt in via
`.settings-section > .btn { width: 100%; margin-top: 8px }`. Don't
bake layout assumptions into colour classes; they will leak into the
next context that reuses the class (this is exactly how the dialog
action row first shipped broken on 2026-05-16).

---

## SEO

The HTML head includes a complete SEO stack:

- **Title + description**: keyword-rich, ~155 char description
- **Standard tags**: `keywords`, `author`, `publisher`, `robots`
  (`max-image-preview:large`), `googlebot`, `referrer`,
  dual `theme-color` keyed to `prefers-color-scheme`, `color-scheme`
- **Canonical**: `<link rel="canonical">` plus `hreflang="de"` + `x-default`
- **Mobile/PWA**: Apple webapp meta (`apple-mobile-web-app-*`),
  MS tile color, `format-detection: telephone=no`
- **OG + Twitter**: full set with image:alt for both
- **JSON-LD `@graph`** with three nodes:
  1. `WebSite` with publisher → Person
  2. `WebApplication` + `Game` multi-type (applicationCategory
     `GameApplication`, `isAccessibleForFree: true`, full `featureList`,
     screenshot, browser requirements)
  3. `Person` (Martin Pfeffer) referenced by both

Files in the web root:
- `robots.txt` — allow all except `/api/`, sitemap reference, explicit
  allow for GPTBot/ChatGPT-User/PerplexityBot/ClaudeBot/Google-Extended
- `sitemap.xml` — root (priority 1.0, weekly) plus legal pages
  (priority 0.3, yearly)

Validation tools:
- Google Rich Results: https://search.google.com/test/rich-results?url=https%3A%2F%2Fxword.celox.io%2F
- Schema.org Validator: https://validator.schema.org/#url=https%3A%2F%2Fxword.celox.io%2F
- OG Debugger: https://developers.facebook.com/tools/debug/?q=https%3A%2F%2Fxword.celox.io%2F

## CI

GitHub Actions (`.github/workflows/test.yml`) runs `npm test` on push to `main` and PRs. The README Tests-Badge points at the workflow.

Tests live in three groups:
- `tests/layout.test.js` — layout algorithm coverage (68 tests, browser-loadable module via globalThis)
- `tests/input-dedupe.test.js` — virtual keyboard double-fire regression suite (11 tests, deterministic via injectable timestamp)
- `tests/server/*.test.js` — backend coverage (34 tests, dynamic `import()` of ES modules into CommonJS test files): session, rate-limit, db (migrations + upsert behavior), achievements (ranks + streaks + computeProfile).
- `tests/puzzles.test.js` — puzzle-data integrity (71 tests, no external deps): manifest ↔ filesystem consistency, per-puzzle shape (required fields, answer charset, grid bounds, duplicate-answer-within-one-puzzle check), clue-quality scans (answer-substring-in-clue, mixed German-quote pattern, min clue length), cross-puzzle reuse soft-cap (max 2 puzzles per answer), and stats.json freshness against the manifest. Caught real bugs on first run: `EICHE` clue contained "Eicheln" (Buche/BUCHE the same), `BAROCK` appeared in 3 puzzles (cap is 2).
- `tests/share-pages.test.js` — per-puzzle share-page template (9 tests): imports `pageFor()` from `scripts/generate-share-pages.mjs` and renders a synthetic puzzle, asserts every OG / Twitter / canonical / `<meta http-equiv=refresh>` / inline-JS-redirect field is correct and the embedded Schema.org `Game` JSON-LD carries the localised theme + difficulty label. Also pins the German-typographic-quote handling in `og:image:alt`.

Total: 193 tests. Run all: `npm test`. Run only one suite: `node --test tests/server/session.test.js`.

---

## Conventions

- All UI text is German.
- Answers are uppercase A–Z only, no spaces/punctuation. Umlauts get spelled out (`ä` → `AE`, `ö` → `OE`, `ü` → `UE`, `ß` → `SS`). UI legend in the clue panel explains this to players.
- Never use `innerHTML` with interpolated user/data content — use `replaceChildren()` + `createElement()`. (Build-time security hook enforces this.)
- The engine is stateless across puzzles — `destroy()` cleans up event listeners and timer; `app.js` always destroys the previous game before starting a new one.
- Toggles (live-validation, hardcore) are mutually exclusive. The whole `.toggle-row` is clickable (label-delegation is wired in `bindToggleRow`).
- **Puzzle descriptions** appear on selector cards and as game subtitle. Avoid:
  - Same lead phrase across puzzles (e.g. "X auf 1-Mio-Niveau" was retired 2026-05-17 — see git history).
  - Echoing the title verbatim (`title: "Aus den Schattenarchiven"` + `description: "Geschichte aus den Schattenarchiven — …"` reads twice in the UI).
  - Difficulty-shaming language ("für Profis", "nur für Bildungsbürger") — describe content, not gatekeep audience.
- **JSON file gotcha**: German typographic quotes `„…"` mix Unicode `U+201E` (opener) with ASCII `"` (closer) — the latter terminates the JSON string prematurely. Use straight `'...'` or escaped `\"...\"` inside clues. The build will fail loudly otherwise.

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
6. `npm test`, commit, push, deploy with `npm run build && rsync dist/`.

For hard puzzles tagged as "1-Mio-Niveau", **read the next section** before committing — three concrete clue-quality failure modes that have already bit us once.

Achievements that need cross-theme coverage (`Bücherwurm`, `Polyglott`, `Bibliothekar`) reflect new themes automatically because they read the manifest at request time.

### Current catalogue (Theme × Difficulty, as of 2026-05-19)

`✓` = one puzzle exists, `✓N` = N puzzles, `—` = gap. Pick gaps with most demand first.

| Theme | Easy | Medium | Hard |
|---|---|---|---|
| allgemein | ✓2 | ✓ | — |
| architektur | — | — | ✓2 |
| astronomie | — | — | ✓2 |
| film | — | — | ✓3 |
| geographie | ✓ | — | ✓2 |
| geschichte | — | ✓ | ✓3 |
| klassik | — | ✓ | ✓ |
| kunst | — | — | ✓3 |
| literatur | — | — | ✓3 |
| medizin | — | — | ✓ |
| musik | ✓ | — | ✓3 |
| mythologie | ✓ | — | ✓3 |
| natur | ✓ | — | ✓ |
| philosophie | — | — | ✓ |
| religion | — | — | ✓ |
| sport | — | — | ✓2 |
| tech | ✓ | ✓ | ✓5 |
| wissenschaft | — | ✓ | ✓5 |

Onboarding is still hard-heavy. Biggest gaps to fill for a smoother ramp: **Easy** in geschichte, klassik, kunst, philosophie, sport, wissenschaft — those themes hit straight to Hard.

---

## Clue-quality guardrails (especially "1-Mio-Niveau")

A 2026-05-16 content review of the recent ultra-hard batch surfaced three error classes that are easy to slip into when writing many obscure clues at once. Watch for them whenever generating new content, manually or via the generator:

1. **Date + place + actor triplets must be consistent.** If a clue names a year *and* a place *and* a person, every leg must match the historical record. The review caught `PINEL — 1793 Salpêtrière`; Pinel's chain-breaking happened at **Bicêtre** in 1793, Salpêtrière was 1795 after his move. When in doubt, drop one anchor instead of guessing.

2. **Use the established lemma form for the answer, not a colloquialism or invented German variant.** The review caught `STRIGEL` — Duden lists *Striegel* only as a horse comb; the architectural term is *Strigilis* (Latin) / *Strigillierung* (German). At 1-Mio-Niveau the player expects a textbook headword.

3. **Number prefixes in clues must denote something.** The review caught `4-WM-Finalist 1954` for PUSKAS — Hungary was Vize-Weltmeister 1954, the "4" mapped to nothing. Drop nonsense numeric prefixes; "WM-Finalist 1954" suffices.

4. **The clue must not contain the answer (or its compound form) as a substring.** The 2026-06-09 introduction of `tests/puzzles.test.js` caught `EICHE → "Laubbaum mit Eicheln"` and `BUCHE → "Rinde und Bucheckern"` — derivative forms (Eicheln from Eiche, Bucheckern from Buche) give the answer away the moment the player reads them. Always rewrite around the family stem ("lappige Blätter, Symbol germanischer Stärke" instead of "Eicheln"). The test is case-insensitive and substring-based, so even partial matches inside larger words ("Wahrzeichen" contains EICHE) trigger it — that's intentional; rewrite, don't suppress.

The same test enforces a soft cap of **2 puzzles per answer** across the whole catalog. `BAROCK` initially appeared in three (klassik-hard-01, kunst-hard-01, geschichte-medium-01); the test forced a replacement in the medium-tier (BAROCK → HANSE) because the two hard-tier domain references were content-driven. When a common epoch / concept word is naturally pulled toward many puzzles, retire it from the lowest-stakes one.

Pre-commit check for any new ultra-hard puzzle: re-read each clue and ask (a) does every named year/place/person triplet check out, (b) is the answer the form a reference work would use, (c) does every number in the clue refer to something concrete, (d) is the answer (or any compound form of it) absent from the clue text.

---

## Adding a new theme template for the generator

Two files:

- `generator/prompts/<theme>.md` — Mustache-style template with `{{count}}`, `{{difficulty}}`, `{{difficultyDe}}`, `{{theme}}` placeholders. Must instruct Claude to return a pure JSON array of `{answer, clue}` objects.
- (Optional) a sample puzzle in `puzzles/` so the theme appears in the selector before the generator is run.

The selector's filter bar enumerates themes from the manifest dynamically — no hardcoded list.
