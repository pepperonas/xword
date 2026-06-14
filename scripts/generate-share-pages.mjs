#!/usr/bin/env node
/**
 * Per-puzzle share-page generator.
 *
 * Writes a minimal HTML page to share/<puzzle-id>/index.html for every puzzle.
 *
 * Why: the SPA uses hash routing (#play=<id>) which crawlers don't dereference,
 * so a shared link would always look like the generic landing page. The static
 * share page contains:
 *   - puzzle-specific OG / Twitter / JSON-LD meta (crawler reads this)
 *   - <meta http-equiv="refresh"> + JS redirect to /#play=<id> (humans go to the SPA)
 *   - small inline "Wird geladen…" fallback for ancient browsers
 *
 * The generated tree mirrors what social cards rendered after the August 2026
 * og-image rollout would expect: absolute og:image URL pointing at og/<id>.png.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = resolve(ROOT, 'share');

const ORIGIN = 'https://xword.celox.io';
const manifest = JSON.parse(readFileSync(join(ROOT, 'puzzles/index.json'), 'utf8'));

mkdirSync(OUT, { recursive: true });

const DIFF_LABEL = { easy: 'Einfach', medium: 'Mittel', hard: 'Schwer' };

const THEME_LABEL = {
  tech: 'Tech', allgemein: 'Allgemein', klassik: 'Klassik',
  mythologie: 'Mythologie', wissenschaft: 'Wissenschaft', kunst: 'Kunst',
  geographie: 'Geographie', architektur: 'Architektur', sport: 'Sport',
  musik: 'Musik', geschichte: 'Geschichte', film: 'Film', natur: 'Natur',
  literatur: 'Literatur', philosophie: 'Philosophie', religion: 'Religion',
  medizin: 'Medizin', astronomie: 'Astronomie',
};

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pageFor(entry) {
  const id = entry.id;
  const title = entry.title;
  const description = entry.description;
  const themeLabel = THEME_LABEL[entry.theme] || entry.theme;
  const difficulty = DIFF_LABEL[entry.difficulty] || entry.difficulty;
  const ogImage = `${ORIGIN}/og/${id}.png`;
  const shareUrl = `${ORIGIN}/share/${id}/`;
  const playUrl = `${ORIGIN}/#play=${id}`;
  const titleFull = `${title} · Kreuzworträtsel`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Game',
    '@id': shareUrl,
    name: title,
    description,
    url: shareUrl,
    inLanguage: 'de-DE',
    isAccessibleForFree: true,
    genre: 'Puzzle',
    gameItem: { '@type': 'Thing', name: themeLabel },
    image: ogImage,
    publisher: {
      '@type': 'Organization',
      name: 'xword.celox.io',
      url: ORIGIN,
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'difficulty', value: difficulty },
      { '@type': 'PropertyValue', name: 'wordCount', value: entry.wordCount },
      { '@type': 'PropertyValue', name: 'gridSize', value: `${entry.size}×${entry.size}` },
    ],
  };

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <title>${escape(titleFull)}</title>
  <meta name="description" content="${escape(description)}">
  <link rel="canonical" href="${shareUrl}">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Kreuzworträtsel">
  <meta property="og:title" content="${escape(titleFull)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:url" content="${shareUrl}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:secure_url" content="${ogImage}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escape('Vorschau-Karte für das Kreuzworträtsel „' + title + '“')}">
  <meta property="og:locale" content="de_DE">

  <!-- Twitter / X -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escape(titleFull)}">
  <meta name="twitter:description" content="${escape(description)}">
  <meta name="twitter:image" content="${ogImage}">
  <meta name="twitter:image:alt" content="${escape('Vorschau-Karte für das Kreuzworträtsel „' + title + '“')}">

  <!-- WhatsApp / Slack / iMessage pick up these too -->
  <link rel="image_src" href="${ogImage}">
  <meta itemprop="image" content="${ogImage}">

  <meta name="theme-color" content="#111318">
  <meta name="robots" content="index, follow, max-image-preview:large">

  <!-- Structured data -->
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

  <!-- Redirect humans into the SPA -->
  <meta http-equiv="refresh" content="0;url=${escape(playUrl)}">
  <script>window.location.replace(${JSON.stringify(playUrl)});</script>

  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           max-width: 640px; margin: 4rem auto; padding: 0 1.25rem; color: #444;
           background: #fafafa; }
    h1 { font-size: 1.6rem; margin-bottom: .25rem; }
    .meta { color: #888; font-size: .95rem; margin-bottom: 1.5rem; }
    .actions { margin-top: 1.5rem; }
    a.btn { display: inline-block; padding: .75rem 1.25rem; background: #0B57D0;
            color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; }
    a.btn:hover { background: #0a4ab0; }
    @media (prefers-color-scheme: dark) {
      body { background: #111318; color: #c8c5d0; }
      h1 { color: #fff; }
      .meta { color: #888a92; }
    }
  </style>
</head>
<body>
  <h1>${escape(title)}</h1>
  <p class="meta">${escape(themeLabel)} · ${escape(difficulty)} · ${entry.wordCount} Wörter</p>
  <p>${escape(description)}</p>
  <p>Wird ins Rätsel weitergeleitet…</p>
  <p class="actions"><a class="btn" href="${escape(playUrl)}">Direkt zum Rätsel öffnen</a></p>
</body>
</html>
`;
}

export { pageFor };

// Self-executing only when invoked directly, so tests can import pageFor()
// without writing files.
if (import.meta.url === `file://${process.argv[1]}`) {
  let written = 0;
  for (const entry of manifest.puzzles) {
    const dir = join(OUT, entry.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), pageFor(entry));
    written++;
  }
  console.log(`share: ${written} pages → share/<id>/index.html`);
}
