<div align="center">

# Kreuzworträtsel Framework

**Ein selbstständiges Kreuzworträtsel-Framework mit KI-gestützter Rätselgenerierung.**

<!-- Repo stats -->
[![GitHub stars](https://img.shields.io/github/stars/pepperonas/xword?style=for-the-badge&logo=github&color=c8a96a&labelColor=1a1a1a)](https://github.com/pepperonas/xword/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/pepperonas/xword?style=for-the-badge&logo=github&color=c8a96a&labelColor=1a1a1a)](https://github.com/pepperonas/xword/network/members)
[![GitHub issues](https://img.shields.io/github/issues/pepperonas/xword?style=for-the-badge&logo=github&color=c8a96a&labelColor=1a1a1a)](https://github.com/pepperonas/xword/issues)
[![GitHub last commit](https://img.shields.io/github/last-commit/pepperonas/xword?style=for-the-badge&logo=git&color=c8a96a&labelColor=1a1a1a)](https://github.com/pepperonas/xword/commits/main)

<!-- License & language -->
[![License: MIT](https://img.shields.io/badge/License-MIT-c8a96a.svg?style=for-the-badge&labelColor=1a1a1a)](LICENSE)
[![Made with Vanilla JS](https://img.shields.io/badge/Vanilla-JS-f7df1e.svg?style=for-the-badge&logo=javascript&logoColor=black&labelColor=1a1a1a)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white&labelColor=1a1a1a)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white&labelColor=1a1a1a)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white&labelColor=1a1a1a)](https://nodejs.org)

<!-- AI & tooling -->
[![Powered by Claude](https://img.shields.io/badge/Powered_by-Claude-6b4ea0?style=for-the-badge&logo=anthropic&logoColor=white&labelColor=1a1a1a)](https://www.anthropic.com/)
[![Anthropic SDK](https://img.shields.io/badge/Anthropic-SDK-d97757?style=for-the-badge&logo=anthropic&logoColor=white&labelColor=1a1a1a)](https://github.com/anthropics/anthropic-sdk-typescript)
[![Claude Code](https://img.shields.io/badge/Built_with-Claude_Code-c8a96a?style=for-the-badge&logoColor=white&labelColor=1a1a1a)](https://claude.com/claude-code)

<!-- Quality -->
[![No Dependencies (frontend)](https://img.shields.io/badge/Frontend-Zero_Dependencies-2d6e4e?style=for-the-badge&labelColor=1a1a1a)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-2d6e4e.svg?style=for-the-badge&labelColor=1a1a1a)](https://github.com/pepperonas/xword/pulls)
[![Maintained](https://img.shields.io/badge/Maintained-yes-2d6e4e.svg?style=for-the-badge&labelColor=1a1a1a)](https://github.com/pepperonas/xword/commits/main)

<!-- Repo metadata -->
[![Code size](https://img.shields.io/github/languages/code-size/pepperonas/xword?style=for-the-badge&labelColor=1a1a1a&color=c8a96a)](https://github.com/pepperonas/xword)
[![Repo size](https://img.shields.io/github/repo-size/pepperonas/xword?style=for-the-badge&labelColor=1a1a1a&color=c8a96a)](https://github.com/pepperonas/xword)
[![Top language](https://img.shields.io/github/languages/top/pepperonas/xword?style=for-the-badge&labelColor=1a1a1a&color=c8a96a)](https://github.com/pepperonas/xword)
[![Languages count](https://img.shields.io/github/languages/count/pepperonas/xword?style=for-the-badge&labelColor=1a1a1a&color=c8a96a)](https://github.com/pepperonas/xword)
[![Open PRs](https://img.shields.io/github/issues-pr/pepperonas/xword?style=for-the-badge&labelColor=1a1a1a&color=c8a96a)](https://github.com/pepperonas/xword/pulls)
[![Contributors](https://img.shields.io/github/contributors/pepperonas/xword?style=for-the-badge&labelColor=1a1a1a&color=c8a96a)](https://github.com/pepperonas/xword/graphs/contributors)

<!-- Misc -->
[![Made in Germany](https://img.shields.io/badge/Made_in-Germany-000000?style=for-the-badge&labelColor=dd0000)](#)
[![Sprache: Deutsch](https://img.shields.io/badge/Sprache-Deutsch-c8a96a?style=for-the-badge&labelColor=1a1a1a)](#)
[![Responsive](https://img.shields.io/badge/Mobile-Responsive-c8a96a?style=for-the-badge&labelColor=1a1a1a)](#)
[![No Build Step](https://img.shields.io/badge/Build_Step-None-2d6e4e?style=for-the-badge&labelColor=1a1a1a)](#)

</div>

---

- **Browser-Spiel**: Statische SPA mit Auswahl-Bildschirm und allen klassischen Mechaniken (Hinweise, Live-Validierung, Timer, Lösungs-Reveal).
- **Auto-Layout**: Du lieferst nur Wörter + Hinweise — der Algorithmus platziert sie auf dem Gitter.
- **KI-Generator**: Node-CLI ruft die Claude-API, validiert die Antwort und schreibt fertige Puzzle-JSONs.
- **Prompt-Templates**: Markdown-Vorlagen für eigene Themen — auch ohne API-Key nutzbar.

## Quick Start

```bash
# 1. Server starten (im Projektroot)
python3 -m http.server 8000

# 2. Im Browser öffnen
open http://localhost:8000/
```

Es erscheint der Auswahlbildschirm mit allen Rätseln aus `puzzles/`.

> **Warum ein Server?** Die App lädt die JSON-Manifeste per `fetch()`.
> Direkt per `file://` blockieren Browser solche Requests aus Sicherheitsgründen.

## Projektstruktur

```
xword/
├── index.html              SPA-Shell (Auswahl + Spiel)
├── assets/
│   ├── styles.css          Komplettes Theme
│   ├── layout.js           Auto-Layout-Algorithmus (browser + node)
│   ├── engine.js           Spiel-Engine (Grid, Eingabe, Stats)
│   └── app.js              View-Routing, Manifest-Loader
├── puzzles/
│   ├── index.json          Manifest (welche Rätsel existieren)
│   └── *.json              Einzelne Rätsel
└── generator/
    ├── generate.js         CLI: Claude → Wörter → Layout → JSON
    ├── package.json
    └── prompts/            Markdown-Templates pro Thema
```

## Eigene Rätsel hinzufügen

### Variante A — Manuell (Hand-kuratiert)

1. Lege eine neue Datei in `puzzles/` an, z.B. `puzzles/musik-easy-01.json`:

   ```json
   {
     "id": "musik-easy-01",
     "title": "Klang & Rhythmus",
     "theme": "musik",
     "difficulty": "easy",
     "description": "Instrumente und Begriffe.",
     "words": [
       { "answer": "GITARRE", "clue": "Saiteninstrument" },
       { "answer": "PIANO",   "clue": "Tasteninstrument" }
     ]
   }
   ```

2. Füge einen Eintrag zu `puzzles/index.json` hinzu.
3. Lade die Seite neu — das Auto-Layout berechnet die Positionen.

**Optional**: Wenn du das Layout fixieren willst (z.B. um es zu prüfen), kannst du `row`, `col`, `direction` pro Wort selbst angeben. Das Framework benutzt dann diese Werte und überspringt das Auto-Layout.

### Variante B — KI-generiert (mit Prompt-Template, manuell)

Du willst kein API-Key konfigurieren? Kopiere einfach den Prompt:

```bash
# Prompt für Claude vorbereiten und in die Zwischenablage:
cat generator/prompts/allgemein.md | sed \
  -e 's/{{count}}/16/g' \
  -e 's/{{difficulty}}/medium/g' \
  -e 's/{{difficultyDe}}/mittel/g' | pbcopy
```

In Claude einfügen, die JSON-Antwort kopieren, und manuell in `puzzles/<id>.json` einbauen:

```json
{
  "id": "allgemein-medium-02",
  "title": "…",
  "theme": "allgemein",
  "difficulty": "medium",
  "description": "…",
  "words": [ … aus Claude … ]
}
```

Manifest aktualisieren, Seite neu laden — fertig.

### Variante C — Voll automatisch (Generator-CLI)

```bash
cd generator
npm install   # einmalig: lädt @anthropic-ai/sdk

export ANTHROPIC_API_KEY=sk-ant-…

node generate.js --theme allgemein --difficulty medium --words 16
```

Das Skript:
1. Lädt das passende Prompt-Template (`prompts/<theme>.md`)
2. Ruft Claude (Standard: `claude-opus-4-7`)
3. Extrahiert + validiert die Wörter
4. Berechnet das Layout
5. Schreibt `puzzles/<theme>-<difficulty>-<NN>.json`
6. Aktualisiert `puzzles/index.json`

**Optionen:**

```
--theme tech|allgemein|wissenschaft|film|<eigenes>
--difficulty easy|medium|hard       (default: medium)
--words N                            (default: 16)
--title "Mein Titel"                 (default: aus theme/difficulty)
--description "Kurztext"
--output ../puzzles/datei.json       (default: auto-nummeriert)
--model claude-opus-4-7              (default)
--dry                                (kein API-Call, Stub-Wörter — Test-Modus)
```

**Test ohne API-Key:**
```bash
node generate.js --theme tech --difficulty easy --words 10 --dry --output /tmp/test.json
```

## Eigenes Thema anlegen

Lege ein neues Prompt-Template an: `generator/prompts/<theme>.md`.

Verwende die Platzhalter:
- `{{count}}` — Anzahl Wörter
- `{{difficulty}}` — `easy` / `medium` / `hard`
- `{{difficultyDe}}` — `leicht` / `mittel` / `schwer`
- `{{theme}}` — Thema-Name

Das Template soll Claude anweisen, **ein reines JSON-Array** mit `{answer, clue}`-Objekten zu liefern. Vorlage: siehe `prompts/tech.md`.

## Auto-Layout — wie es funktioniert

1. Wörter werden nach Länge sortiert (längstes zuerst).
2. Erstes Wort liegt horizontal in der Gittermitte.
3. Für jedes weitere Wort:
   - Suche alle Stellen, an denen es ein bereits platziertes Wort kreuzt (gleicher Buchstabe, senkrechte Richtung).
   - Prüfe die Standard-Kreuzwort-Bedingungen (kein paralleles Berühren, keine ungewollte Wort-Verlängerung).
   - Wähle den Kandidaten mit den meisten Kreuzungen und der zentralsten Lage.
4. Mehrere Durchläufe mit unterschiedlicher Reihenfolge — der kompakteste Lösungsversuch gewinnt.

Wenn du das Ergebnis fixieren willst (damit jedes Laden dasselbe Layout zeigt), bake es in die JSON:

```bash
# einmalig auf einer JSON ohne row/col ausführen — danach enthält sie das Layout
node -e "
require('./assets/layout.js');
const fs = require('fs');
const p = require('./puzzles/musik-easy-01.json');
const r = globalThis.XwordLayout.layout(p.words);
p.size = r.size;
p.words = r.words.map(w => ({ answer: w.answer, clue: w.clue, row: w.row, col: w.col, direction: w.direction }));
fs.writeFileSync('./puzzles/musik-easy-01.json', JSON.stringify(p, null, 2));
"
```

## Bedienung im Spiel

- **Maus**: Zelle klicken → Wort aktivieren. Erneut klicken → Richtung wechseln.
- **Klicken einer Hinweis-Zeile**: aktiviert das Wort.
- **Pfeiltasten**: Navigation. Erste Richtungstaste wechselt nur die Eingaberichtung.
- **Tab / Shift+Tab**: zum nächsten/vorigen Wort.
- **Enter**: Richtung des aktiven Wortes umschalten.
- **Buchstaben tippen**: ans aktive Feld schreiben, springt zum nächsten leeren Feld im Wort.
- **Backspace**: Buchstabe löschen, dann ein Feld zurück.
- **Live-Validierung-Toggle**: jede Eingabe wird sofort gegen die Lösung geprüft.

## Bekannte Eigenheiten

- Umlaute werden auf `AE / OE / UE` normalisiert (das Gitter zeigt also `STRASSE`, nicht `STRAßE`). Hinweise dürfen Umlaute enthalten.
- Auf `file://` (ohne Server) bleibt der Auswahl-Bildschirm leer. Immer `python3 -m http.server` o.ä. nutzen.
- Wenn der Generator zu wenige platzierbare Wörter liefert (`⚠ N Wörter konnten nicht platziert werden`), erhöhe `--words` oder versuche es nochmal — anderer Seed, anderes Layout.

## Lizenz / Credits

Basis-Design und -Mechanik: aus dem Original-Prototyp **„Kreuzworträtsel — Tech Edition"** von Martin Pfeffer.
