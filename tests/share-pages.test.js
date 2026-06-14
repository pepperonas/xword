/**
 * Unit tests for the per-puzzle share-page generator.
 *
 * Mirrors what a social-card crawler reads from /share/<id>/. We don't
 * test the file-writer (the script's main loop) — only the page-template
 * function, called with a synthetic manifest entry. Catches:
 *   - missing or wrong OG / Twitter / JSON-LD fields
 *   - meta-refresh + window.location redirect both present
 *   - canonical URL + og:url stay in sync with `id`
 *   - german-quote handling in og:image:alt (was a bug at first ship)
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

async function loadPageFor() {
  // generate-share-pages.mjs is ESM; load via dynamic import.
  const mod = await import(path.join('..', 'scripts', 'generate-share-pages.mjs'));
  return mod.pageFor;
}

const ENTRY = {
  id: 'tech-hard-01',
  file: 'tech-hard-01.json',
  title: 'Aus den Quellcode-Archiven',
  theme: 'tech',
  difficulty: 'hard',
  description: 'Sprachen, Pioniere, Konzepte — Programmiersprachen-Theorie aus dem Vordiplom.',
  wordCount: 14,
  size: 15,
};

describe('share-page template', () => {
  test('renders the puzzle title in <title>', async () => {
    const pageFor = await loadPageFor();
    const html = pageFor(ENTRY);
    assert.match(html, /<title>Aus den Quellcode-Archiven · Kreuzworträtsel<\/title>/);
  });

  test('renders Open Graph image pointing at og/<id>.png', async () => {
    const pageFor = await loadPageFor();
    const html = pageFor(ENTRY);
    assert.match(html, /property="og:image" content="https:\/\/xword\.celox\.io\/og\/tech-hard-01\.png"/);
    assert.match(html, /property="og:image:width" content="1200"/);
    assert.match(html, /property="og:image:height" content="630"/);
  });

  test('renders Twitter large card with same image', async () => {
    const pageFor = await loadPageFor();
    const html = pageFor(ENTRY);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(html, /name="twitter:image" content="https:\/\/xword\.celox\.io\/og\/tech-hard-01\.png"/);
  });

  test('og:url and canonical point at the static share URL', async () => {
    const pageFor = await loadPageFor();
    const html = pageFor(ENTRY);
    assert.match(html, /property="og:url" content="https:\/\/xword\.celox\.io\/share\/tech-hard-01\/"/);
    assert.match(html, /rel="canonical" href="https:\/\/xword\.celox\.io\/share\/tech-hard-01\/"/);
  });

  test('has both meta-refresh and JS redirect to the SPA hash route', async () => {
    const pageFor = await loadPageFor();
    const html = pageFor(ENTRY);
    assert.match(html, /<meta http-equiv="refresh" content="0;url=https:\/\/xword\.celox\.io\/#play=tech-hard-01">/);
    assert.match(html, /window\.location\.replace\("https:\/\/xword\.celox\.io\/#play=tech-hard-01"\)/);
  });

  test('og:image:alt uses German typographic quotes around the title', async () => {
    const pageFor = await loadPageFor();
    const html = pageFor(ENTRY);
    // „…“ — Unicode opener AND Unicode closer. Earlier draft mixed Unicode
    // opener with ASCII " which the escape() then HTML-encoded to &quot;.
    assert.match(html, /og:image:alt" content="Vorschau-Karte für das Kreuzworträtsel „Aus den Quellcode-Archiven“"/);
  });

  test('embeds Schema.org Game JSON-LD with localised theme label', async () => {
    const pageFor = await loadPageFor();
    const html = pageFor(ENTRY);
    const match = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s);
    assert.ok(match, 'JSON-LD script present');
    const ld = JSON.parse(match[1]);
    assert.equal(ld['@type'], 'Game');
    assert.equal(ld.name, ENTRY.title);
    assert.equal(ld.description, ENTRY.description);
    assert.equal(ld.image, 'https://xword.celox.io/og/tech-hard-01.png');
    assert.equal(ld.url, 'https://xword.celox.io/share/tech-hard-01/');
    assert.equal(ld.gameItem.name, 'Tech', 'theme slug → label');
    const diff = ld.additionalProperty.find((p) => p.name === 'difficulty');
    assert.equal(diff.value, 'Schwer', 'difficulty slug → label');
    const grid = ld.additionalProperty.find((p) => p.name === 'gridSize');
    assert.equal(grid.value, '15×15');
  });

  test('escapes HTML-special chars in title and description', async () => {
    const pageFor = await loadPageFor();
    const tricky = {
      ...ENTRY,
      title: 'Foo & <bar>',
      description: 'A "quote" and an apostrophe\'s edge case.',
    };
    const html = pageFor(tricky);
    assert.match(html, /<title>Foo &amp; &lt;bar&gt; · Kreuzworträtsel<\/title>/);
    assert.match(html, /og:description" content="A &quot;quote&quot; and an apostrophe&#39;s edge case\."/);
    // Critically: the raw "<bar>" tag must never appear unescaped anywhere
    // — that would close the meta tag or open a stray element. Since the
    // string only goes into title + description, both must come out escaped.
    assert.ok(html.split('&lt;bar&gt;').length - 1 >= 2,
      'expected the title to come out HTML-escaped in meta + body');
    // Inside the <script type="application/ld+json"> block, JSON.stringify
    // can legitimately leave a raw "<bar>" — script content is opaque CDATA
    // and only "</script>" would break it. So scope the negative check to
    // OUTSIDE the JSON-LD script block.
    const noJsonLd = html.replace(/<script type="application\/ld\+json">.*?<\/script>/s, '');
    assert.ok(!/<bar[ >]/.test(noJsonLd),
      'no unescaped <bar> tag boundary outside JSON-LD');
  });

  test('difficulty-specific label appears in the body fallback', async () => {
    const pageFor = await loadPageFor();
    const easy = pageFor({ ...ENTRY, id: 't-easy', difficulty: 'easy' });
    assert.match(easy, /Tech · Einfach/);
    const medium = pageFor({ ...ENTRY, id: 't-med', difficulty: 'medium' });
    assert.match(medium, /Tech · Mittel/);
  });
});
