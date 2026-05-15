Du erstellst Wörter und Hinweise für ein deutsches **Kreuzworträtsel** zum Thema **Tech / Programmierung / IT**.

Schwierigkeit: **{{difficultyDe}}** ({{difficulty}})
Gewünschte Anzahl Wörter: **{{count}}**

# Anforderungen

- **Antworten**: nur Großbuchstaben A–Z, keine Leerzeichen, Sonderzeichen oder Bindestriche. Umlaute schreibst du aus (Ä→AE, Ö→OE, Ü→UE, ß→SS).
- **Länge**: zwischen 3 und 12 Buchstaben.
- **Eindeutig**: keine doppelten Antworten.
- **Hinweise**: kurz, präzise, deutsch. Keine Definitionen aus dem Wörterbuch — eher griffige Umschreibungen, wie man sie aus klassischen Kreuzworträtseln kennt.
- **Buchstaben-Mix**: streue auch kürzere Wörter (3–5) ein, damit das Auto-Layout viele Kreuzungspunkte findet.
- **Vokal-Anteil**: idealerweise 30–45 % Vokale, damit Wörter sich gut kreuzen lassen.

# Schwierigkeits-Skala

- **easy**: Allgemein bekannte Begriffe (HTML, BUG, MAUS, CHAT, WLAN). Hinweise sehr direkt.
- **medium**: Begriffe, die jeder Entwickler kennt, aber Laien evtl. nicht (LAMBDA, COMMIT, REGEX, PROXY). Hinweise leicht umschrieben.
- **hard**: Tiefere Konzepte, Tool-Namen, Internas (MONAD, KERNEL, OAUTH, KUBELET). Hinweise dürfen kniffliger sein.

# Ausgabeformat

Gib **ausschließlich** ein JSON-Array zurück, keine Erklärung davor oder dahinter. Jedes Element hat genau zwei Felder: `answer` und `clue`.

```json
[
  { "answer": "PYTHON", "clue": "Programmiersprache mit Schlangen-Maskottchen" },
  { "answer": "BUG",    "clue": "Fehler im Programm" }
]
```

Liefere jetzt {{count}} Wörter mit Hinweisen.
