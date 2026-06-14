#!/usr/bin/env node
/**
 * Per-puzzle OG-Image generator.
 *
 * Reads puzzles/index.json + each puzzles/<file>.json, renders a 1200×630 PNG
 * for every puzzle into og/<puzzle-id>.png. The PNG is what social cards (WhatsApp,
 * Twitter/X, iMessage, LinkedIn, Slack) show as preview when somebody shares the
 * per-puzzle share URL https://xword.celox.io/share/<id>/.
 *
 * Visual design (1200×630, dark surface):
 *   - top strap: brand "xword.celox.io · Kreuzworträtsel"
 *   - title (big, on-surface white)
 *   - theme chip (primary) + difficulty chip (color-coded)
 *   - description (2 lines, on-surface-variant)
 *   - bottom-right: a sample word rendered as mini crossword cells
 *   - bottom-left: footer "Rätsel des Tages · Erfolgssystem · Offline"
 *
 * Run-time: ~30ms per puzzle render. For 53 puzzles: ~2s wall-clock total.
 *
 * Pure build-time tool. Re-run via `npm run og:bump` or automatically via build.sh.
 */
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const FONTS_DIR = resolve(__dirname, 'fonts');
const OUT = resolve(ROOT, 'og');

for (const name of ['Inter-Regular.ttf', 'Inter-Bold.ttf', 'Inter-ExtraBold.ttf']) {
  if (!existsSync(join(FONTS_DIR, name))) {
    console.error(`error: missing font ${join(FONTS_DIR, name)} — see scripts/fonts/README.md`);
    process.exit(1);
  }
}

const interRegular = readFileSync(join(FONTS_DIR, 'Inter-Regular.ttf'));
const interBold = readFileSync(join(FONTS_DIR, 'Inter-Bold.ttf'));
const interExtraBold = readFileSync(join(FONTS_DIR, 'Inter-ExtraBold.ttf'));

const manifest = JSON.parse(readFileSync(join(ROOT, 'puzzles/index.json'), 'utf8'));
mkdirSync(OUT, { recursive: true });

const DIFF = {
  easy:   { label: 'Einfach', bg: 'rgba(45, 110, 78, 0.22)',  border: '#2d6e4e' },
  medium: { label: 'Mittel',  bg: 'rgba(200, 169, 106, 0.22)', border: '#c8a96a' },
  hard:   { label: 'Schwer',  bg: 'rgba(217, 119, 87, 0.22)',  border: '#d97757' },
};

const THEME_LABEL = {
  tech: 'Tech',
  allgemein: 'Allgemein',
  klassik: 'Klassik',
  mythologie: 'Mythologie',
  wissenschaft: 'Wissenschaft',
  kunst: 'Kunst',
  geographie: 'Geographie',
  architektur: 'Architektur',
  sport: 'Sport',
  musik: 'Musik',
  geschichte: 'Geschichte',
  film: 'Film',
  natur: 'Natur',
  literatur: 'Literatur',
  philosophie: 'Philosophie',
  religion: 'Religion',
  medizin: 'Medizin',
  astronomie: 'Astronomie',
};

const el = (type, props) => ({ type, props });

function titleSize(text) {
  const n = text.length;
  if (n <= 22) return 84;
  if (n <= 32) return 72;
  if (n <= 42) return 60;
  return 52;
}

function clip(str, n) {
  if (str.length <= n) return str;
  return str.slice(0, n - 1).trimEnd() + '…';
}

function chip({ label, bg, border, color }) {
  return el('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      padding: '10px 22px',
      fontSize: '24px',
      fontWeight: 700,
      borderRadius: '999px',
      background: bg,
      border: `2px solid ${border}`,
      color: color || '#ffffff',
      letterSpacing: '0.4px',
    },
    children: label,
  });
}

function gridCell(letter, opts = {}) {
  return el('div', {
    style: {
      width: '72px', height: '72px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: opts.empty ? 'transparent' : '#f4f1e6',
      border: opts.empty ? '2px solid rgba(255,255,255,0.08)' : '2px solid #1a1a1a',
      borderRadius: '6px',
      fontSize: '40px',
      fontWeight: 800,
      color: '#0B57D0',
      fontFamily: 'Inter',
    },
    children: opts.empty ? '' : letter,
  });
}

function sampleRow(word) {
  const letters = word.slice(0, Math.min(word.length, 7)).split('');
  return el('div', {
    style: { display: 'flex', gap: '6px' },
    children: letters.map((ch) => gridCell(ch)),
  });
}

async function renderPuzzle(entry) {
  const p = JSON.parse(readFileSync(join(ROOT, 'puzzles', entry.file), 'utf8'));

  // Sample word: prefer a 5-7 letter word, fallback to longest available
  const candidates = p.words.filter((w) => w.answer.length >= 5 && w.answer.length <= 7);
  const sample = (candidates.length ? candidates : p.words)
    .slice()
    .sort((a, b) => b.answer.length - a.answer.length)[0].answer;

  const diff = DIFF[entry.difficulty];
  const themeLabel = THEME_LABEL[entry.theme] || entry.theme;

  const tree = el('div', {
    style: {
      width: '1200px',
      height: '630px',
      display: 'flex',
      flexDirection: 'column',
      background: '#111318',
      fontFamily: 'Inter',
      color: '#ffffff',
      padding: '60px 72px',
      position: 'relative',
      overflow: 'hidden',
    },
    children: [
      // background accents
      el('div', {
        style: {
          position: 'absolute',
          top: '-220px',
          right: '-180px',
          width: '640px',
          height: '640px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(11, 87, 208, 0.30) 0%, rgba(11, 87, 208, 0) 70%)',
        },
      }),
      el('div', {
        style: {
          position: 'absolute',
          bottom: '-160px',
          left: '-140px',
          width: '480px',
          height: '480px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(200, 169, 106, 0.18) 0%, rgba(200, 169, 106, 0) 70%)',
        },
      }),
      // Brand strap
      el('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          fontSize: '24px',
          fontWeight: 700,
          color: '#c8a96a',
          letterSpacing: '0.6px',
          zIndex: 1,
        },
        children: [
          el('div', {
            style: {
              width: '14px', height: '14px',
              borderRadius: '3px',
              background: '#0B57D0',
              border: '2px solid #c8a96a',
              display: 'flex',
            },
          }),
          el('div', { style: { display: 'flex' }, children: 'xword.celox.io · Kreuzworträtsel' }),
        ],
      }),
      // Title (centered vertical)
      el('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          marginTop: '44px',
          maxWidth: '1080px',
          zIndex: 1,
        },
        children: [
          el('div', {
            style: {
              fontSize: `${titleSize(entry.title)}px`,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: '-0.5px',
              display: 'flex',
            },
            children: entry.title,
          }),
          el('div', {
            style: {
              display: 'flex',
              gap: '14px',
              alignItems: 'center',
            },
            children: [
              chip({
                label: themeLabel,
                bg: 'rgba(11, 87, 208, 0.22)',
                border: '#0B57D0',
              }),
              chip(diff),
              el('div', {
                style: {
                  display: 'flex',
                  fontSize: '24px',
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontWeight: 500,
                },
                children: `${entry.wordCount} Wörter · ${entry.size}×${entry.size}`,
              }),
            ],
          }),
          el('div', {
            style: {
              fontSize: '28px',
              color: 'rgba(255, 255, 255, 0.78)',
              lineHeight: 1.34,
              maxWidth: '900px',
              fontWeight: 400,
              display: 'flex',
            },
            children: clip(entry.description, 140),
          }),
        ],
      }),
      // Bottom row: footer + sample grid
      el('div', {
        style: {
          position: 'absolute',
          left: '72px',
          right: '72px',
          bottom: '52px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 1,
        },
        children: [
          el('div', {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            },
            children: [
              el('div', {
                style: {
                  fontSize: '20px',
                  color: 'rgba(255, 255, 255, 0.55)',
                  fontWeight: 500,
                  letterSpacing: '0.4px',
                  display: 'flex',
                },
                children: 'Rätsel des Tages · Erfolgssystem · Dark Mode · Offline',
              }),
              el('div', {
                style: {
                  fontSize: '22px',
                  fontWeight: 700,
                  color: '#c8a96a',
                  display: 'flex',
                },
                children: 'xword.celox.io',
              }),
            ],
          }),
          sampleRow(sample),
        ],
      }),
    ],
  });

  const svg = await satori(tree, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Inter', data: interRegular, weight: 400, style: 'normal' },
      { name: 'Inter', data: interBold, weight: 700, style: 'normal' },
      { name: 'Inter', data: interExtraBold, weight: 800, style: 'normal' },
    ],
  });

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  writeFileSync(join(OUT, `${entry.id}.png`), Buffer.from(png));
}

const t0 = Date.now();
let rendered = 0;
for (const entry of manifest.puzzles) {
  await renderPuzzle(entry);
  rendered++;
}
console.log(
  `og: ${rendered} images → ${OUT.replace(ROOT + '/', '')}/<id>.png (${Date.now() - t0}ms)`
);
