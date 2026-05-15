Du erstellst Wörter und Hinweise für ein deutsches **Kreuzworträtsel** mit **Allgemeinwissen**.

Schwierigkeit: **{{difficultyDe}}** ({{difficulty}})
Gewünschte Anzahl Wörter: **{{count}}**

# Themenmix

Mische Begriffe aus folgenden Bereichen — pro Rätsel etwa gleich verteilt:

- Geografie (Länder, Hauptstädte, Flüsse, Gebirge)
- Natur und Tiere
- Alltag und Haushalt
- Kunst, Musik, Literatur (klassische Werke und Autoren)
- Geschichte (große Persönlichkeiten und Ereignisse)
- Sport
- Wissenschaft (Grundlagen)

# Anforderungen

- **Antworten**: nur Großbuchstaben A–Z, keine Leerzeichen, Sonderzeichen oder Bindestriche. Umlaute schreibst du aus (Ä→AE, Ö→OE, Ü→UE, ß→SS).
- **Länge**: zwischen 3 und 12 Buchstaben.
- **Eindeutig**: keine doppelten Antworten.
- **Hinweise**: kurz, präzise, deutsch. Klassische Kreuzworträtsel-Stil — griffig, nicht akademisch.
- **Buchstaben-Mix**: streue auch kürzere Wörter (3–5) ein, damit das Auto-Layout viele Kreuzungspunkte findet.
- **Vokal-Anteil**: idealerweise 30–45 % Vokale.

# Schwierigkeits-Skala

- **easy**: Geläufige Begriffe (PARIS, APFEL, BERG, MOND). Hinweise sehr direkt ("Hauptstadt Frankreichs").
- **medium**: Erweitertes Allgemeinwissen (PICASSO, AMAZONAS, RENAISSANCE). Hinweise leicht umschrieben.
- **hard**: Spezifischeres Wissen, Eigennamen, Fachbegriffe (SOKRATES, INKAS, OBELISK). Hinweise dürfen mehrdeutig wirken.

# Ausgabeformat

Gib **ausschließlich** ein JSON-Array zurück, keine Erklärung davor oder dahinter. Jedes Element hat genau zwei Felder: `answer` und `clue`.

```json
[
  { "answer": "PARIS", "clue": "Hauptstadt Frankreichs" },
  { "answer": "MOND",  "clue": "Erdtrabant" }
]
```

Liefere jetzt {{count}} Wörter mit Hinweisen.
