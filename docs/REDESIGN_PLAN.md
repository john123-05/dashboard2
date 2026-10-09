# Redesign Betreiber-Dashboard (HubSpot-Stil, dunkles Orange)

Stand: 09.10.2026. Dieses Dokument ist die Arbeitsgrundlage für Claude und Codex. Wer übernimmt,
liest zuerst `CLAUDE.md`, `docs/I18N.md` und dann dieses Dokument und macht bei der ersten
offenen Phase weiter. Nach jeder Phase: Häkchen setzen, Commit, kurze Notiz unter „Protokoll“.

## Auftrag (von John, sinngemäß)

- Das Dashboard soll wie ein professionelles Produkt wirken, nicht wie ein „KI-Dashboard“.
  Vorbild ist HubSpot: Schrift, Ruhe, Abstände, Navigation, Upgrade-Seiten.
- Statt HubSpots Grün/Petrol nehmen wir **dunkles Orange** als Akzentfarbe.
- **Funktionen nicht ändern.** Anordnung, Inhalte und Texte bleiben; es geht um Gestaltung,
  Bedienbarkeit, Übergänge. Keine neuen Texte erfinden.
- Kreisdiagramme und andere Diagramme laufen weiterhin animiert ein.
- Navigation: Drag & Drop zuverlässig, Einklappen mit Tooltip wie bei HubSpot,
  „Mehr“ klappt **nach rechts** als Flyout mit Unterkategorien auf, nicht nach unten.
- Seiten mit „Upgrade“ (Online-Shop, Speedmessung, Konfiguration-Produkte) einheitlich wie
  HubSpots Seiten für noch nicht freigeschaltete Funktionen.
- Einstellungen-Seite gestalterisch komplett überarbeiten (Funktion bleibt).
- Strukturiert, Seite für Seite, nicht alles auf einmal.

## Was HubSpot ausmacht (Analyse der Screenshots von John, Oktober 2026)

1. **Schrift:** „Lexend Deca“ in der ganzen Oberfläche. Große Überschriften in **leichter** Stärke
   (300) und groß (32–36 px), Titel und Buttons halbfett (600), Fließtext 14 px regular.
   Wenig Großbuchstaben-Labels, kaum gesperrte Schrift.
2. **Flächen:** Seiteninhalt auf weißer Fläche mit großzügigem Rand; Karten weiß, 1 px Rand
   (sehr helles Grau-Blau), kleiner Radius (8–12 px), fast kein Schatten.
   **Abweichung auf Johns Wunsch:** Der Glas-Effekt (Blur, leicht durchscheinend, Farbverlauf im
   Hintergrund) bleibt, aber mit klarem, durchgehendem Rand (`--glass-border`).
3. **Navigation:** dunkle, ruhige Seitenleiste (fast schwarz), Einträge mit Icon + Text, aktiver
   Eintrag als helle abgerundete Fläche. Unten: Stift (Navigation bearbeiten), Einklappen-Symbol
   mit Tooltip („Navigation einklappen“), darunter eine Upgrade-Box. „Mehr“ öffnet ein Flyout nach
   rechts: links Kategorien, rechts die Unterpunkte, mit Pin-Symbol zum Anheften.
4. **Buttons:** Primär = gefüllt, voll abgerundet (Pill), dunkle Akzentfarbe, weiße halbfette Schrift.
   Sekundär = weiß mit 1 px dunklem Rand, ebenfalls Pill. Kleine Varianten für Tabellen-Aktionen.
5. **Tabs:** Text-Tabs mit Unterstrich (2–3 px) unter dem aktiven Tab, kein „Segment-Schalter“-Look.
6. **Upgrade-/Leerseiten:** links große, leichte Überschrift (2 Zeilen), darunter 3–4 Stichpunkte mit
   Pfeil-Kreis-Icon (fette Einleitung + normaler Text), ein Hinweiskasten mit Rand, dann Primär- und
   Sekundär-Button. Rechts eine Illustration/Screenshot auf hellgrauer Fläche mit Bildunterschrift.
   Darunter optional „So funktioniert es“ mit zwei Video-/Bild-Karten.
   In der Navigation trägt ein gesperrter Eintrag ein kleines Upgrade-Symbol (Pfeil im Kreis).
7. **Tabellen/Listen:** dezente Kopfzeile, Zeilentrenner, Links in Akzentfarbe, Info-Icons neben
   Spaltentiteln, Filterleiste mit Dropdown-Chips.
8. **Bewegung:** kurze, leise Übergänge (150–200 ms), keine springenden „slide-up“-Effekte bei jedem
   Laden; Flyouts/Tooltips blenden weich ein.

## Design-Grundlagen (Tokens), Phase 1

| Token | Wert | Verwendung |
|---|---|---|
| Schrift | Lexend Deca (Google Fonts, 300/400/500/600) | ganze Operator-Oberfläche |
| Akzent | `#C2410C` (orange-700) | Primär-Buttons, aktive Tabs, Links, Fokus |
| Akzent hover | `#9A3412` (orange-800) | Hover/aktiv |
| Akzent hell | `#FFF4ED` / `#FFEDD5` | ausgewählte Zeilen, Badges, aktive Navigationspunkte (hell) |
| Text | `#1F2933` (Überschriften), `#33475B` (Text), `#5C6F82` (sekundär) | |
| Rand | `#DFE3EB` | Karten, Eingabefelder, Tabellen |
| Seitenfläche | Mesh-Verlauf bleibt, Karten Glas `rgba(255,255,255,.62)` + Blur, Rand `rgba(203,214,226,.95)` | Johns Wunsch: Glas behalten, klarer Rand |
| Navigation | `#2B2B2B` / aktiv `#3D3D3D`, Text `#E6E8EB` | Seitenleiste |
| Radius | Karten 12 px, Eingaben 8 px, Buttons Pill | |
| Schatten | höchstens `0 1px 2px rgba(16,24,40,.04)` | Karten |
| Erfolg/Warnung/Fehler | bleiben (emerald/amber/rose), nur gedämpfter | Status-Chips |

Umsetzung zentral über die vorhandenen Klassen, damit sich alle Seiten auf einmal angleichen,
ohne dass Seitenlogik angefasst wird:
- `src/index.css`: `--brand-*`, `.glass-panel`, `.glass-panel-strong`, `.glass-input`,
  `.glass-button`, `.glass-button-primary`, `.glass-button-secondary`, `.mesh-gradient`,
  `.glass-sidebar`, Body-Schrift.
- `tailwind.config.js`: `brand`-Farbskala auf dunkles Orange ziehen, `fontFamily.sans` = Lexend Deca.
- `index.html`: Google-Fonts-Link für Lexend Deca.
- `src/components/ui/GlassCard.tsx`: `animate-slide-up` nur noch dezent (oder weglassen).
- Die Klassennamen `glass-*` bleiben (keine Massen-Umbenennung), nur ihr Aussehen ändert sich.

## Phasen (Seite für Seite)

Jede Phase: nur Gestaltung, keine Funktionsänderung. Prüfen mit `npm run typecheck`
(nur die bekannten alten Fehler: `kioskSales.ts(377)`, `zahlungen.ts(130)`, `Leads.tsx` DataTable,
`Support.tsx(170)`, Staff-Dateien), `npm run check:i18n`, `npm run build` und im Browser
(`npm run dev`, Port 5180) in Desktop- und Handy-Breite. Screenshots vorher/nachher an John.

- [x] **Phase 1 – Grundlagen:** Schrift, Farben, Karten, Buttons, Eingabefelder, Tabs-Stil,
      Seitenhintergrund (Tokens oben). Danach sieht jede Seite schon ruhiger aus.
- [ ] **Phase 2 – Navigation (`src/components/layout/Sidebar.tsx`, `DashboardLayout.tsx`):**
  - Dunkle, ruhige Leiste im HubSpot-Stil, aktiver Eintrag hell hinterlegt.
  - „Mehr“ als Flyout **nach rechts** (Portal, positioniert am Button), mit den ausgelagerten
    Einträgen; Pin-Symbol zum Zurückholen in die Hauptliste (Funktion `setUnpinned` bleibt).
  - Unten: Stift-Symbol = Bearbeitungsmodus für Reihenfolge (Drag & Drop nur in diesem Modus,
    mit sichtbaren Griffen, Drop-Linie, Tastatur-Alternative ↑/↓), Einklappen-Symbol mit Tooltip
    nach rechts („Navigation einklappen“). Speicherung weiter über `operator_profiles.nav_item_order`
    und `nav_unpinned_items`.
  - Eingeklappt: nur Icons, Tooltip mit Namen nach rechts; „Mehr“ auch eingeklappt als Flyout.
  - Upgrade-Einträge (Online-Shop, Speedmessung) mit kleinem Upgrade-Symbol statt „(Upgrade)“-Text.
  - Offene Frage an John: Der Hell/Dunkel-Schalter setzt nur `data-operator-theme`, es gibt dafür
    keine Styles – Dunkelmodus ist heute ohne Wirkung. Entfernen oder richtig bauen?
- [ ] **Phase 3 – Upgrade-Seiten-Vorlage:** gemeinsame Komponente (z. B. `src/components/upgrade/UpgradeHero.tsx`)
      im HubSpot-Aufbau (Überschrift, 3–4 Pfeil-Stichpunkte, Hinweiskasten, Buttons, Bild rechts,
      optional Karten darunter). Einsetzen bei: Speedmessung (nicht freigeschaltet), Online-Shop
      (Kopfbereich, Preisseite verlinken), CRM-Preise, Shop-Preise. Inhalte/Texte bleiben, nur in der
      Vorlage angeordnet.
- [ ] **Phase 4 – Übersicht (`Overview.tsx`) und Umsatz (`Revenue.tsx`, `ZahlungsUebersicht.tsx`,
      `AutomatenUebersicht.tsx`):** KPI-Karten (`KPICard.tsx`) im neuen Stil, Diagramm-Karten,
      Zeitraum-Schalter als Tabs/Chips. Animationen der Diagramme behalten.
- [ ] **Phase 5 – CRM (`Leads.tsx`, `components/survey/*`):** Tabs mit Unterstrich, Kennzahlen-Karten,
      Weltkarte-Karte, Tabellen (`components/ui/DataTable.tsx`) im HubSpot-Tabellenstil.
- [ ] **Phase 6 – Online-Shop (`Shop.tsx`, `ShopPricing.tsx`), Speedmessung (`Users.tsx`,
      `SpeedmessungOffer.tsx`), Konfiguration (`Configuration.tsx`, `ConfigurationProduct.tsx`).**
- [ ] **Phase 7 – Einstellungen (`Settings.tsx`):** komplette Gestaltung neu: linke Unternavigation
      (Abschnitte), rechts Formulare in Karten, klare Abschnittstitel, Speichern-Leiste unten fixiert.
      Alle Felder und Funktionen bleiben.
- [ ] **Phase 8 – Restliche Seiten:** Käufe, Fotos, Personalisierung (+ Overlay-Editor), Support,
      Systemzustand, Kamera, Mitarbeiter, Login/Registrierung.
- [ ] **Phase 9 – Feinschliff:** Leerzustände, Ladezustände (Skeletons statt Spinner, wo sinnvoll),
      Dialoge/Pop-ups einheitlich (eine `Modal`-Komponente), Tooltips, Fokus-Ringe, Handy-Ansicht.

## Regeln für alle Phasen

- Keine Funktionen, Datenflüsse, Texte oder Reihenfolgen von Inhalten ändern.
- Neue sichtbare Texte nur über `t('…')` und in allen 7 Sprachen (siehe `docs/I18N.md`).
- Diagramme (recharts) behalten ihre Einlauf-Animation.
- Staff-Dashboard (`src/staff/*`) nicht anfassen.
- Git: nur benannte Dateien stagen, nie `git add -A`. Pushen nur, wenn John es sagt
  (danach braucht bolt.new einen Publish-Klick).
- Kein SQL direkt ausführen.

## Protokoll

- 09.10.2026: Plan angelegt. Übersetzungen vorher abgeschlossen (siehe `docs/I18N.md`).
- 09.10.2026: Phase 1 umgesetzt (Lexend Deca über Google Fonts in `index.html`, `brand`-Skala auf
  dunkles Orange in `tailwind.config.js`, `src/index.css`: Tokens `--ink*`, `--line*`, `--canvas`,
  Karten weiß ohne Blur, Buttons als Pills, Eingabefelder, Seitenhintergrund flach, Sidebar deckend,
  Animationen kürzer). Offen für spätere Phasen: viele Seiten nutzen fest `bg-slate-900`-Buttons und
  `bg-white/40`-Innenflächen statt der Klassen – das wird je Seite angeglichen.
- 09.10.2026: Auf Johns Wunsch Glas-Effekt wiederhergestellt (Blur, durchscheinende Karten, Mesh-Hintergrund), aber mit klarem grau-blauem Rand statt weißem Schimmer.
