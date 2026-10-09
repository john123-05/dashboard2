# Agent Context

All agent/session context for this repo lives in `CLAUDE.md` (read that
first, regardless of which LLM you are). The ecosystem-wide map is in
`john123-05/testsoftware` -> `docs/ECOSYSTEM.md`.

## Laufende Arbeit (Stand 09.10.2026)

Nach `CLAUDE.md` außerdem lesen:

1. `docs/I18N.md` – wie Übersetzungen funktionieren und wie man neue Texte einträgt.
2. `docs/REDESIGN_PLAN.md` – laufendes Redesign, Phase für Phase. Bei der ersten offenen
   Phase weitermachen und den Fortschritt dort eintragen.

Kurzregeln: auf Deutsch mit John kommunizieren; nur benannte Dateien stagen; nicht pushen ohne
Johns Okay; kein SQL direkt ausführen; Staff-Dashboard (`src/staff`) nicht anfassen;
neue Texte nur über `t('…')` in allen 7 Sprachen; vor dem Fertigmelden `npm run check:i18n`,
`npm run typecheck`, `npm run build` und Sichtprüfung auf `http://localhost:5180`.
