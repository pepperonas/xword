#!/usr/bin/env node
/**
 * Crossword Generator CLI
 *
 *   node generate.js \
 *     --theme tech \
 *     --difficulty medium \
 *     --words 16 \
 *     [--title "Mein Titel"] \
 *     [--output ../puzzles/tech-medium-02.json] \
 *     [--model claude-opus-4-7] \
 *     [--dry]           # don't call the API, use a stub
 *
 * Requires env var ANTHROPIC_API_KEY (unless --dry).
 * Updates ../puzzles/index.json automatically.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Load shared layout module. It attaches XwordLayout to globalThis when not in a browser.
require(path.join(__dirname, '..', 'assets', 'layout.js'));
const { layout, normaliseAnswer } = globalThis.XwordLayout;

const DIFFICULTIES = ['easy', 'medium', 'hard'];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next; i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function die(msg) {
  console.error('\x1b[31m' + msg + '\x1b[0m');
  process.exit(1);
}

function loadPromptTemplate(theme) {
  const file = path.join(__dirname, 'prompts', `${theme}.md`);
  if (!fs.existsSync(file)) {
    die(`Kein Prompt-Template für Theme "${theme}" gefunden.\n` +
        `Erwarteter Pfad: ${file}\n` +
        `Vorhandene Templates: ${fs.readdirSync(path.join(__dirname, 'prompts')).join(', ')}`);
  }
  return fs.readFileSync(file, 'utf8');
}

function fillPrompt(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] != null ? String(vars[k]) : `{{${k}}}`);
}

async function callClaude(prompt, model) {
  let Anthropic;
  try {
    Anthropic = require('@anthropic-ai/sdk').default;
  } catch (e) {
    die('Modul @anthropic-ai/sdk fehlt. Bitte installieren:\n  cd generator && npm install');
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) die('ANTHROPIC_API_KEY ist nicht gesetzt. Beispiel:\n  export ANTHROPIC_API_KEY=sk-ant-…');

  const client = new Anthropic({ apiKey });

  console.log(`→ Sende Anfrage an ${model}…`);
  const resp = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = resp.content.map(block => block.type === 'text' ? block.text : '').join('');
  return text;
}

function extractJson(text) {
  // Find first balanced [...] in response.
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === ']') {
      depth--;
      if (depth === 0 && start >= 0) {
        const sub = text.slice(start, i + 1);
        try {
          return JSON.parse(sub);
        } catch (e) {
          start = -1;
        }
      }
    }
  }
  throw new Error('Konnte kein valides JSON-Array in der Claude-Antwort finden.');
}

function validateWords(words) {
  if (!Array.isArray(words)) throw new Error('Antwort ist kein Array.');
  if (words.length < 5) throw new Error(`Zu wenige Wörter: ${words.length}`);
  const seen = new Set();
  const cleaned = [];
  for (const w of words) {
    if (!w.answer || !w.clue) continue;
    const normalised = normaliseAnswer(w.answer);
    if (normalised.length < 3) continue;
    if (seen.has(normalised)) continue;
    seen.add(normalised);
    cleaned.push({ answer: normalised, clue: String(w.clue).trim() });
  }
  if (cleaned.length < 5) throw new Error(`Nach Filterung zu wenige gültige Wörter: ${cleaned.length}`);
  return cleaned;
}

function stubWords(theme, count) {
  // Used in --dry mode for testing without the API.
  const sample = {
    tech: [
      { answer: 'PYTHON', clue: 'Programmiersprache mit Schlangen-Maskottchen' },
      { answer: 'BUG', clue: 'Fehler im Programm' },
      { answer: 'COMMIT', clue: 'Änderung in Git festschreiben' },
      { answer: 'BRANCH', clue: 'Parallele Entwicklungslinie in Git' },
      { answer: 'LAMBDA', clue: 'Anonyme Funktion' },
      { answer: 'TERMINAL', clue: 'Textbasierte Kommandozeile' },
      { answer: 'SHELL', clue: 'Kommandozeilen-Interpreter' },
      { answer: 'TOKEN', clue: 'Authentifizierungs-Zeichenkette' },
      { answer: 'ARRAY', clue: 'Geordnete Liste von Werten' },
      { answer: 'LOOP', clue: 'Wiederholungs-Konstrukt' },
      { answer: 'NULL', clue: 'Abwesenheit eines Wertes' },
      { answer: 'FORK', clue: 'Repository kopieren' },
    ],
    allgemein: [
      { answer: 'EIFEL', clue: 'Mittelgebirge in Westdeutschland' },
      { answer: 'DONAU', clue: 'Großer europäischer Fluss' },
      { answer: 'ALPEN', clue: 'Bekanntes Hochgebirge in Europa' },
      { answer: 'SCHACH', clue: 'Strategiespiel mit König und Dame' },
      { answer: 'TURM', clue: 'Hoher Bauwerksteil' },
      { answer: 'BAUER', clue: 'Schachfigur in der ersten Reihe' },
    ],
  };
  const list = sample[theme] || sample.tech;
  return list.slice(0, count);
}

function buildOutputFilename(theme, difficulty, requested) {
  if (requested) return path.resolve(requested);
  const puzzlesDir = path.join(__dirname, '..', 'puzzles');
  let n = 1;
  while (fs.existsSync(path.join(puzzlesDir, `${theme}-${difficulty}-${String(n).padStart(2, '0')}.json`))) n++;
  return path.join(puzzlesDir, `${theme}-${difficulty}-${String(n).padStart(2, '0')}.json`);
}

function updateManifest(entry) {
  const manifestPath = path.join(__dirname, '..', 'puzzles', 'index.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const existing = manifest.puzzles.findIndex(p => p.id === entry.id);
  if (existing >= 0) manifest.puzzles[existing] = entry;
  else manifest.puzzles.push(entry);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

async function main() {
  const args = parseArgs(process.argv);
  const theme = args.theme;
  const difficulty = args.difficulty || 'medium';
  const requestedWords = parseInt(args.words || '16', 10);
  const model = args.model || 'claude-opus-4-7';
  const dry = !!args.dry;

  if (!theme) {
    die('Usage: node generate.js --theme <name> [--difficulty easy|medium|hard] [--words N] [--title …] [--output …] [--dry]');
  }
  if (!DIFFICULTIES.includes(difficulty)) {
    die(`Unbekannte Schwierigkeit "${difficulty}". Erlaubt: ${DIFFICULTIES.join(', ')}`);
  }

  const promptTemplate = loadPromptTemplate(theme);
  const prompt = fillPrompt(promptTemplate, {
    theme,
    difficulty,
    difficultyDe: { easy: 'leicht', medium: 'mittel', hard: 'schwer' }[difficulty],
    count: requestedWords,
  });

  let rawText;
  if (dry) {
    console.log('→ DRY mode: benutze Stub-Wortliste');
    rawText = JSON.stringify(stubWords(theme, requestedWords));
  } else {
    rawText = await callClaude(prompt, model);
  }

  let parsed;
  try {
    parsed = extractJson(rawText);
  } catch (e) {
    console.error('Antwort:\n', rawText);
    die('Parsing fehlgeschlagen: ' + e.message);
  }

  let validated;
  try {
    validated = validateWords(parsed);
  } catch (e) {
    die('Validierung fehlgeschlagen: ' + e.message);
  }
  console.log(`✓ ${validated.length} Wörter validiert.`);

  console.log('→ Berechne Layout…');
  const laid = layout(validated, { tries: 120 });
  if (laid.unplaced.length > 0) {
    console.warn(`⚠ ${laid.unplaced.length} Wörter konnten nicht platziert werden:`,
                 laid.unplaced.map(w => w.answer).join(', '));
  }
  console.log(`✓ Gitter: ${laid.size}×${laid.size}, ${laid.words.length} Wörter platziert.`);

  const outFile = buildOutputFilename(theme, difficulty, args.output);
  const baseId = path.basename(outFile, '.json');
  const fileName = path.basename(outFile);
  const title = args.title || `${theme.charAt(0).toUpperCase() + theme.slice(1)} (${difficulty})`;
  const description = args.description || `Generiertes Rätsel · ${laid.words.length} Wörter`;

  const clueByAnswer = Object.fromEntries(validated.map(w => [w.answer, w.clue]));
  const puzzle = {
    id: baseId,
    title,
    theme,
    difficulty,
    description,
    size: laid.size,
    words: laid.words.map(w => ({
      answer: w.answer,
      clue: clueByAnswer[w.answer] || w.clue,
      row: w.row,
      col: w.col,
      direction: w.direction,
    })),
  };

  fs.writeFileSync(outFile, JSON.stringify(puzzle, null, 2) + '\n');
  console.log(`✓ Geschrieben: ${path.relative(process.cwd(), outFile)}`);

  updateManifest({
    id: baseId,
    file: fileName,
    title,
    theme,
    difficulty,
    description,
    wordCount: puzzle.words.length,
    size: puzzle.size,
  });
  console.log('✓ Manifest aktualisiert: puzzles/index.json');

  console.log('\n\x1b[32mFertig.\x1b[0m Öffne index.html (oder lade neu) — das Rätsel erscheint in der Bibliothek.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
