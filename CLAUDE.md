# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: xword

A self-contained crossword puzzle framework with AI-powered puzzle generation.

- **Browser game**: Static SPA (`index.html` + `assets/`) — no build step, no framework.
- **Puzzle data**: One JSON file per puzzle in `puzzles/`, indexed by `puzzles/index.json`.
- **Generator CLI**: `generator/generate.js` calls the Claude API and writes puzzle JSON files.

## Architecture

Three layered modules under `assets/`:

- `layout.js` — pure auto-layout algorithm. Takes `[{ answer, clue }]`, returns `{ size, words: [{ answer, clue, row, col, direction }], unplaced }`. Attaches to `window.XwordLayout` in the browser and to `globalThis.XwordLayout` when `require()`d from Node — the generator CLI relies on this dual binding to share code.
- `engine.js` — game engine. `XwordEngine.createGame(puzzle, refs, callbacks)` mounts a fully playable game into existing DOM elements. Receives DOM refs (no querySelector inside the engine for static elements). Returns `{ destroy }`.
- `app.js` — SPA shell. Loads the manifest, renders the selector view, handles `#play=<id>` hash routing, hands off to `engine.createGame()` on puzzle selection.

The game-view DOM lives entirely in `index.html`; `engine.js` never creates the outer structure, only the grid cells and clue items.

## Puzzle JSON schema

Two valid forms:

1. **Pre-laid-out** (production puzzles, generator output): includes `size` and `row`/`col`/`direction` per word. Used as-is.
2. **Just words** (manual prototypes): only `words: [{ answer, clue }]`. `app.js` calls `XwordLayout.layout()` at load time.

`puzzles/index.json` is the only file the SPA *requires* to discover puzzles. Each entry needs `id`, `file`, `title`, `theme`, `difficulty`, `description`, `wordCount`, `size`.

## Auto-layout constraints

The algorithm enforces standard crossword rules:
- Crossings must share the same letter.
- Non-crossing cells of a new word must not have parallel-adjacent filled cells (would create unintended 2-letter words).
- The cells immediately before/after a word's endpoints must be empty (no unintended word extension).

If too many words remain unplaced, the issue is usually low vowel content or many words of the same length without good crossing letters — `attemptLayout` runs ~80 randomised passes with different seed orderings; if all fail, the best partial layout wins.

## Generator workflow

`generator/generate.js` is a single-file Node CLI:

1. Loads `generator/prompts/<theme>.md` (Mustache-style `{{count}}`, `{{difficulty}}`, `{{difficultyDe}}` placeholders).
2. Calls Claude (`claude-opus-4-7` by default) via `@anthropic-ai/sdk`. Falls back to a built-in stub word list when `--dry` is set.
3. Extracts the first balanced `[…]` JSON array from the response.
4. Normalises answers (`ÄÖÜ`→`AE/OE/UE`, `ß`→`SS`, strips non-A-Z), dedupes, filters length ≥ 3.
5. Runs the layout algorithm.
6. Writes `puzzles/<theme>-<difficulty>-NN.json` and updates `puzzles/index.json`.

The generator does not need `cd` into `generator/` — relative paths use `__dirname`.

## Adding a new theme

Two files needed:
- `generator/prompts/<theme>.md` — prompt template, must instruct Claude to return a pure JSON array of `{answer, clue}` objects.
- (Optional) a sample puzzle in `puzzles/` so the theme appears in the selector before the generator is run.

The selector's filter bar enumerates themes from the manifest dynamically — no hardcoded theme list.

## Development commands

```bash
# Run the SPA locally (required — fetch() needs http:// not file://)
python3 -m http.server 8000

# Bake auto-layout into an existing words-only JSON (deterministic positions afterwards)
node -e "
require('./assets/layout.js');
const fs = require('fs');
const p = require('./puzzles/<name>.json');
const r = globalThis.XwordLayout.layout(p.words);
p.size = r.size;
p.words = r.words.map(w => ({ answer: w.answer, clue: w.clue, row: w.row, col: w.col, direction: w.direction }));
fs.writeFileSync('./puzzles/<name>.json', JSON.stringify(p, null, 2));
"

# Generate a new puzzle (requires ANTHROPIC_API_KEY)
cd generator && npm install
node generate.js --theme tech --difficulty medium --words 16

# Dry-run the generator without an API key
node generator/generate.js --theme tech --difficulty easy --words 10 --dry --output /tmp/test.json

# Syntax-check all JS
node --check assets/layout.js
node --check assets/engine.js
node --check assets/app.js
node --check generator/generate.js
```

## Conventions

- All UI text is German.
- Answers are uppercase A-Z only, no spaces/punctuation. Umlauts get spelled out (`ä`→`AE`).
- Never use `innerHTML` with interpolated user/data content — use `replaceChildren()` + `createElement()`. (A security hook enforces this.)
- The engine is stateless across puzzles — `destroy()` cleans up event listeners and the timer; `app.js` always destroys the previous game before starting a new one.
