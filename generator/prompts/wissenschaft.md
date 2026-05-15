Du erstellst Wörter und Hinweise für ein deutsches **Kreuzworträtsel** zum Thema **Wissenschaft**.

Schwierigkeit: **{{difficultyDe}}** ({{difficulty}})
Gewünschte Anzahl Wörter: **{{count}}**

# Bereiche

Mische Begriffe aus:
- Physik (Elemente, Phänomene, Konstanten)
- Chemie (Elemente, Verbindungen, Reaktionen)
- Biologie (Zellen, Organe, Tiergruppen)
- Astronomie (Planeten, Sterne, Konstellationen)
- Mathematik (Begriffe, Zahlenarten)
- Geologie (Gesteine, Phänomene)

# Anforderungen

- **Antworten**: nur Großbuchstaben A–Z, keine Leerzeichen, Sonderzeichen, Bindestriche. Umlaute ausgeschrieben.
- **Länge**: 3–12 Buchstaben.
- **Eindeutig**: keine doppelten Antworten.
- **Hinweise**: kurz, präzise, deutsch. Wissenschaftlich korrekt aber nicht zu trocken.
- **Buchstaben-Mix**: viele kurze Wörter (3–5) für Kreuzungen.
- **Vokal-Anteil**: 30–45 %.

# Schwierigkeits-Skala

- **easy**: Schulwissen (ATOM, ZELLE, MOND, ERDE). Hinweise eindeutig.
- **medium**: Vertieftes Wissen (PHOTON, MITOSE, GALAXIE, ENZYM). Hinweise leicht umschrieben.
- **hard**: Fachbegriffe (ENTROPIE, MITOCHONDRIUM, QUARK, BARYON). Hinweise dürfen Vorwissen voraussetzen.

# Ausgabeformat

Gib **ausschließlich** ein JSON-Array zurück, keine Erklärung davor oder dahinter:

```json
[
  { "answer": "ATOM",  "clue": "Kleinster Baustein eines Elements" },
  { "answer": "PHOTON","clue": "Lichtteilchen" }
]
```

Liefere jetzt {{count}} Wörter mit Hinweisen.
