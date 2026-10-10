# Agent Context

All agent/session context for this repo lives in `CLAUDE.md` (read that
first, regardless of which LLM you are). The ecosystem-wide map is in
`john123-05/testsoftware` -> `docs/ECOSYSTEM.md`.

## Laufende Arbeit (Stand 10.10.2026)

Nach `CLAUDE.md` außerdem lesen:

1. `docs/PRODUKT_PLAN.md` – **aktueller Hauptplan** (Pläne/Preise, Marketing-CRM, Rechte, Mobil).
   Oben steht ein Übergabe-Prompt; bei der ersten offenen Aufgabe in Abschnitt 6 weitermachen.
2. `docs/I18N.md` – wie Übersetzungen funktionieren und wie man neue Texte einträgt.
3. `docs/REDESIGN_PLAN.md` – Designentscheidungen und Protokoll des Redesigns.

Kurzregeln: auf Deutsch mit John kommunizieren; nur benannte Dateien stagen; nicht pushen ohne
Johns Okay; kein SQL direkt ausführen; Der frühere Staff-/Super-Admin-Bereich ist seit 10.10.2026 NICHT mehr in diesem Repo (lebt im Repo `liftpictures-crm`);
neue Texte nur über `t('…')` in allen 7 Sprachen; vor dem Fertigmelden `npm run check:i18n`,
`npm run typecheck`, `npm run build` und Sichtprüfung auf `http://localhost:5180`.
