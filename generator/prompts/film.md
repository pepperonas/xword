Du erstellst Wörter und Hinweise für ein deutsches **Kreuzworträtsel** zum Thema **Film & Serien**.

Schwierigkeit: **{{difficultyDe}}** ({{difficulty}})
Gewünschte Anzahl Wörter: **{{count}}**

# Bereiche

- Regisseure (Spielberg, Tarantino, Lynch …)
- Schauspieler (Brando, Streep, Hanks …)
- Filmtitel (einzelne Wörter, ohne Artikel)
- Genres (Western, Thriller, Drama …)
- Studios und Produktionen
- Filmbegriffe (KAMERA, SCRIPT, KULISSE …)
- Serien-Klassiker

# Anforderungen

- **Antworten**: nur Großbuchstaben A–Z, keine Leerzeichen, Sonderzeichen, Bindestriche. Umlaute ausgeschrieben.
- **Länge**: 3–12 Buchstaben.
- **Eindeutig**: keine doppelten Antworten.
- **Eigennamen**: bevorzugt Nachnamen (BRANDO statt MARLONBRANDO), oder einzelne Filmtitel-Wörter (PSYCHO, MATRIX).
- **Hinweise**: kurz, präzise, deutsch. Filmische Atmosphäre erlaubt.
- **Buchstaben-Mix**: kürzere Wörter einstreuen für Kreuzungen.

# Schwierigkeits-Skala

- **easy**: Sehr bekannte Namen und Filme (KAMERA, MATRIX, TITANIC, OSCAR).
- **medium**: Solides Filmwissen (KUBRICK, FELLINI, NEOREALISMUS).
- **hard**: Cineasten-Wissen (TARKOWSKI, ANTONIONI, EXPRESSIONISMUS).

# Ausgabeformat

Gib **ausschließlich** ein JSON-Array zurück, keine Erklärung davor oder dahinter:

```json
[
  { "answer": "OSCAR",  "clue": "Goldene Filmtrophäe" },
  { "answer": "MATRIX", "clue": "Sci-Fi-Klassiker mit roter und blauer Pille" }
]
```

Liefere jetzt {{count}} Wörter mit Hinweisen.
