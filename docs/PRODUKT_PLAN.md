# Produktplan: Betreiber-Dashboard → Produkt mit Plänen, Marketing-CRM und Add-ons

Stand: 10.10.2026 · Autor: Claude (Opus) mit John · Repo: `john123-05/dashboard2`, lokal `~/Downloads/Cursor/dashboard2-4`

---

## 0. ÜBERGABE-PROMPT (zum Kopieren in Claude Sonnet / Codex / ein neues Chatfenster)

```text
Du arbeitest am Liftpictures Betreiber-Dashboard (Vite + React + TypeScript + Tailwind,
Supabase). Repo-Wurzel: ~/Downloads/Cursor/dashboard2-4 (GitHub john123-05/dashboard2).

Lies in dieser Reihenfolge, bevor du etwas änderst:
1. CLAUDE.md            – Projektkontext, zwei Supabase-Projekte, Arbeitsregeln
2. AGENTS.md            – Kurzregeln
3. docs/I18N.md         – wie Texte in 7 Sprachen eingetragen werden (Pflicht für jeden neuen Text)
4. docs/PRODUKT_PLAN.md – DIESE Datei: Ziel, Designsystem, Aufgabenliste
5. docs/REDESIGN_PLAN.md – Designentscheidungen + Protokoll bisheriger Arbeit

Dann:
- Nimm die ERSTE Aufgabe in Abschnitt 6 („Aufgabenliste“), die noch `[ ]` hat und deren
  „Voraussetzung“ erfüllt ist. Arbeite nur diese eine Aufgabe ab.
- Halte dich exakt an „Dateien“, „Schritte“ und „Fertig, wenn“. Nutze die Bausteine aus
  Abschnitt 4 (Designsystem) statt eigene Stile zu erfinden.
- Neue Texte NUR über t('…') und scripts/i18n_apply.py in allen 7 Sprachen. Deutsche Texte nie
  umformulieren, wenn sie schon existieren. Du-Form, „du/dein“ klein.
- Prüfen: npm run check:i18n · npx tsc --noEmit -p tsconfig.app.json (bekannte Altfehler in
  kioskSales.ts, zahlungen.ts, Leads.tsx DataTable, Support.tsx, src/staff ignorieren) · npm run build ·
  Sichtprüfung auf http://localhost:5180 (Desktop UND 390 px Breite).
- SQL NIE selbst ausführen: Migration nach supabase/migrations/ schreiben, mit pbcopy kopieren,
  John den passenden SQL-Editor-Link geben (shared: kvpcwlcfgmsmarjtwpsx, operator: xcrxltiiovpoladpaewd).
- Git: nur benannte Dateien stagen, nie `git add -A`. Commit mit kurzer deutscher Nachricht.
  NICHT pushen ohne Johns Okay. Nach Push braucht bolt.new einen Publish-Klick.
- Nach der Aufgabe: Häkchen `[x]` in Abschnitt 6 setzen und eine Zeile im Protokoll (Abschnitt 9).
- Lässt eine Aufgabe eine Produktentscheidung offen: die für den Kunden sichere Variante wählen
  (nichts sperren, nichts löschen, nichts teurer machen), im Protokoll vermerken und John fragen.
- Aufgaben mit (O) nur umsetzen, wenn Datenmodell/Schnittstelle im Plan ausgeschrieben sind – sonst
  zuerst nur den Entwurf in den Plan schreiben und John zeigen.
- Kommuniziere mit John auf Deutsch, kurz, ohne Fachjargon.
```

---

## 1. Ziel in einem Satz

Das Dashboard wird ein **Produkt mit klaren Stufen**: ein kostenloser **Basis-Plan** (alles rund um
Betrieb, Umsatz und Anlage – Teil des Liftpictures-Service) und bezahlte **Marketing-Pläne** und
**Add-ons**, die dem Park nachweisbar Kontakte, Bewertungen, Reichweite und Umsatz bringen.
Vorbild in Aufbau und Gestaltung: HubSpot (Free → Starter → Professional, Upgrade-Seiten,
Einrichtungsassistent, Marketing-Startseite).

## 2. Wie HubSpot es macht – was wir übernehmen

| HubSpot-Muster | Bei uns |
|---|---|
| Kostenloses CRM als Einstieg, bezahlte „Hubs“ mit Stufen Free/Starter/Pro | **Basis (kostenlos)** · **Marketing Starter** · **Marketing Pro** + Add-ons (Online-Shop, Speedmessung, Hardware) |
| Gesperrte Funktionen bleiben in der Navigation sichtbar, mit Upgrade-Symbol und eigener Upgrade-Seite | haben wir schon (UpgradeHero, „(Upgrade)“); wird auf alle Plan-Funktionen ausgeweitet |
| Marketing-Startseite mit Kennzahlen, Trichter, „Nächste Schritte“-Assistent | neue Startseite „Marketing-CRM“ |
| E-Mail-Marketing mit Monatskontingent, Vorlagen, Versand nach Sprache/Segment | „E-Mail-Marketing“ mit Kontingent je Plan, Zusatzpakete |
| Feedback-Umfragen mit NPS-Verlauf, Antwortquote, Detail je Frage | Umfrage-Auswertung neu |
| Social-Tool: Beiträge planen, Kampagnen, Auswertung | **auf uns zugeschnitten**: Foto-Teilen-Kampagnen, Gewinnspiele, Teilen-Link mit Besucherzähler |
| Teams & Rechte: Rollen-Vorlagen + Häkchen je Bereich | Mitarbeiter & Rechte neu |
| Academy / Wissensdatenbank | „Ratgeber“-Artikel, von uns geschrieben, im Dashboard und Hilfe-Center |
| „Account & Abrechnung“, Plan-Vergleich, Self-Service-Upgrade | Seite „Pläne“ + später Stripe |

**Nicht** übernehmen: generisches Social-Posting für alle Netzwerke, Landingpage-Baukasten,
Chatbots, Sales-Pipelines. Alles muss sich um **das Foto des Gastes** drehen.

## 3. Pläne, Preise, Angebote (Vorschlag – Preise von John bestätigen lassen)

Grundsatz: Bestehende Preise aus dem Code bleiben gültig (CRM 49 €/Monat, Online-Shop 749 € + 99 €/Monat
oder 15 % Revenue Share, Speedmessung 149/249/99 €). Die Pläne bündeln sie neu.

### 3.1 Stufen

| | **Basis** (kostenlos) | **Marketing Starter** | **Marketing Pro** |
|---|---|---|---|
| Preis | 0 € (im Automaten-Service enthalten) | **49 €/Monat** (= heutiger CRM-Preis) | **149 €/Monat** (von John bestätigt) |
| Übersicht, Umsatz, Käufe, Fotos, Systemzustand, Kamera, Personalisierung/Overlays, Support, Ratgeber, Benachrichtigungen | ✓ | ✓ | ✓ |
| Mitarbeiter-Zugänge | 3, feste Rollen | 10, Rollen-Vorlagen | unbegrenzt, Rechte je Seite |
| Digitales Foto gegen Kontakt (Freischaltung), Kontakte, CSV-Export | – | ✓ | ✓ |
| Umfrage + NPS-Auswertung | – | ✓ | ✓ inkl. Bewertungs-Weiterleitung (Google) |
| Werbe-Pixel (Meta/Google) | – | ✓ | ✓ |
| E-Mail-Marketing (Monatskontingent) | – | 2.000 E-Mails | 10.000 E-Mails, mehrsprachig, Automationen |
| Social-Media-Kampagnen & Gewinnspiele | – | Teilen-Freischaltung (Selbstmeldung) | Kampagnen, Gewinnspiel-Ziehung, Teilen-Link mit Zähler |
| Berichte & Export | – | Basis | Vergleich Vorjahr/Saison, PDF-Bericht |

### 3.2 Add-ons (unabhängig vom Plan, wie heute)

Online-Shop · Speedmessung (+ Display) · PrintBox · Cashbox · Zusatz-E-Mails (+10.000 für 19 €, Vorschlag) ·
weiterer Automat.

### 3.3 Angebote, Upsell, Downsell

- **Unwiderstehliches Einstiegsangebot (Saisonstart):** „Marketing Pro 3 Monate kostenlos testen –
  wenn du in 90 Tagen nicht mindestens 500 neue Kontakte hast, zahlst du die nächsten 3 Monate nicht.“
  (Zahl an Parkgröße anpassen; Imst sammelt ~800 Kontakte in der Saison.)
- **Saison-Abo (Downsell statt Kündigung):** in Monaten ohne Betrieb pausiert das Abo (0 €) – passt zu
  Freizeitparks. Beim Kündigen zuerst anbieten: „Pausieren“ oder „auf Starter wechseln“.
- **Upsell-Auslöser im Produkt** (kleine Hinweise mit Button „Pläne ansehen“, nie aufdringlich):
  - Kontaktliste erreicht 80 % des Plan-Limits / E-Mail-Kontingent zu 80 % verbraucht
  - Umfrage zeigt viele Promoter → „Leite zufriedene Gäste zu Google-Bewertungen weiter (Pro)“
  - Speedmessung aktiv + Starter → „Rekord-Kampagne starten (Pro)“
  - Viele unverkaufte Fotos → Online-Shop (gibt es schon)
- **Bundle „Komplett“:** Marketing Pro + Online-Shop + Speedmessung, Einrichtung Online-Shop entfällt
  (wie heutiges Kombi-Paket).

### 3.4 Kennzeichnung in der Oberfläche

- Seitenleiste in **Gruppen**: „Betrieb“ (kostenlos) und „Marketing“ (Plan-Abzeichen „Starter“/„Pro“
  bei gesperrten Einträgen = Upgrade-Symbol wie heute).
- Seitenkopf jeder Plan-Seite: kleines Abzeichen „Marketing Starter“ bzw. „Inklusive im Basis-Plan“.
- Profilmenü (TopBar): „Plan: Basis · Pläne ansehen“.
- Neue Seite **/plaene**: Vergleichstabelle (wie HubSpot Pricing), aktueller Plan markiert,
  Buttons „Anfragen“ (bis Stripe da ist) → `meldeAusstattungsInteresse`.

## 4. Designsystem (verbindlich – so sieht alles aus)

Tokens (`src/index.css`): `--ink #1f2933` (Text), `--ink-2 #33475b`, `--ink-3 #5c6f82` (gedämpft),
`--line #dfe3eb`, `--line-strong #cbd6e2`, `--canvas #f5f7fa`, Akzent `brand-600 #c2410c`
(Hover `brand-700`). Schrift Lexend Deca. Dunkelmodus: `src/styles/operator-dark.css` deckt die
üblichen Klassen ab – neue Farben dort ergänzen.

Bausteine (immer wiederverwenden):

| Zweck | Baustein / Klassen |
|---|---|
| Seitenkopf | `UpgradePageHeader` aus `src/components/upgrade/UpgradeHero.tsx` (Titel light 28–32 px, Untertitel, Aktionen rechts) |
| Karte | `GlassCard` (`src/components/ui/GlassCard.tsx`) mit `p-5 sm:p-6`; Kopfzeile `border-b border-[color:var(--line)] px-5 py-4` |
| Kennzahl | Label `text-xs text-[color:var(--ink-3)]`, Wert `text-[28px] font-light leading-none tabular-nums` (siehe `Kennzahl` in `SystemHealth.tsx`) |
| Primär-Button | `glass-button-primary` (orange Pill). Sekundär: `glass-button-secondary` (weiß, Rand). „Schwarze“ Buttons: `rounded-full bg-[color:var(--ink)] text-white` |
| Reiter | Unterstrich-Reiter wie „Was passiert ist“ in `SystemHealth.tsx` (`border-b-2 border-brand-600`) |
| Filter-Chips | Pills wie Schweregrad-Filter in `SystemHealth.tsx` |
| Segment-Schalter | wie „Einfach/Ausführlich“ in `AutomatHealth.tsx` |
| Status-Chip | `rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset` + `bg-emerald-50 text-emerald-700 ring-emerald-200` (ok) / amber (Warnung) / rose (Fehler) |
| Gesperrte Funktion | `UpgradeHero` + `PlanCard`/`PriceFigure`/`PlanAction` (`src/components/upgrade/`) |
| Liste/Tabelle | `DataTable` (`src/components/ui/DataTable.tsx`); auf < 640 px als Karten (siehe Aufgabe M2) |
| Schublade / Popover | wie `NotificationsDrawer` / `ProfileMenu` in `src/components/layout/TopBar.tsx` |
| Leerzustand | grauer Bereich `bg-slate-50`, Satz in `text-[20px] font-light`, Beispielkarten, ein Primär-Button (siehe `EmptyNotifications`) |
| Diagramme | recharts, Einlauf-Animation behalten, Farben: brand-600, sky-500, emerald-500, Raster `#e2e8f0` |

Regeln: keine Glas-/Blur-Effekte, keine Verläufe als Hintergrund, Ecken `rounded-lg`/`rounded-xl`,
Schatten nur bei schwebenden Elementen. Großbuchstaben-Labels vermeiden. Jede Seite muss bei 390 px
ohne seitliches Scrollen funktionieren.

## 5. Fakten zum Code (damit niemand suchen muss)

- Navigation: `src/components/layout/Sidebar.tsx` (`navItems`, Unterseiten über `children`,
  Pin/„Mehr“, Drag & Drop, `staffAllowed`/`ownerOnly`). CRM-Unterseiten: `src/lib/crmTabs.ts`,
  Route `/leads/*` in `src/App.tsx`.
- Rollen: `organization_memberships.role` (Operator-Projekt xcrx) ∈ `platform_admin, org_owner,
  park_manager, marketing, support_agent, staff`. `AuthContext`: `isOwner` = org_owner|platform_admin,
  `isStaff` = staff. Mitarbeiter anlegen: Edge Function `manage-staff` (nur org_owner).
- Gesperrt/freigeschaltet heute: Speedmessung über `hasGuestActivity(parkId)` (feste Park-Liste in
  `src/components/GuestActivityAwareOverlay.tsx`), Online-Shop über `shop.activation_requested_at`, CRM nicht gesperrt.
  Ausstattung/Upgrades: Tabelle `park_equipment_items` (shared), `src/lib/equipment.ts`.
- Benachrichtigungen: `src/lib/notificationFeed.ts` (`useNotificationFeed`), UI in `TopBar.tsx`.
  **Bug:** Übersicht-Karte „Benachrichtigungen und Aktivitäten“ (`src/pages/Overview.tsx`,
  `activityItems`) nutzt den Feed nicht → Automaten-Störungen fehlen dort (siehe Aufgabe A2).
- CRM: `src/pages/Leads.tsx` (Kontakte + Übersicht, 1.765 Zeilen), `src/components/survey/*`
  (UnlockCenter, SurveyManager, SurveyResultsView, SocialManager, TrackingManager, ContactSettings),
  API `src/lib/surveyApi.ts` → Edge Function `operator-survey` (shared). Tabellen: `park_survey_settings`,
  `park_survey_questions`, `park_survey_responses`, `park_social_entries`, `park_tracking_settings`,
  `photo_claims` (shared).
- Leistung: CRM-Übersicht Imst (815 Kontakte + Weltkarte) blockiert den Browser mehrere Sekunden →
  Aufgabe C4.
- Hilfe-Center-Inhalte: `src/lib/helpContent.ts`, Plan `docs/HILFE_CENTER.md`.
- Staff-Dashboard (`src/staff/*`, eigenes CSS `staff/styles.css`) ist das „Liftpictures CRM“ für uns intern.

## 6. Aufgabenliste (in dieser Reihenfolge)

Legende Modell: **S** = Sonnet/Codex medium reicht · **O** = Opus empfohlen. Seit 10.10.2026 sind alle
früheren (O)-Aufgaben in Abschnitt 6a ausgeschrieben und damit (S). Opus nur noch zum Gegenlesen am Ende einer Phase.

### Phase A – Sofort (klein)

- [x] **A1 Navigation: „CRM“ → „Marketing-CRM“** (S) – erledigt 10.10.2026.
- [x] **A2 Übersicht zeigt dieselben Benachrichtigungen wie die Glocke** (S) – erledigt 10.10.2026.
  Lösung: `NotificationsProvider` (in `notificationFeed.ts`) im `DashboardLayout`, TopBar und Übersicht
  lesen `useNotifications()`; die Übersicht zeigt ungelesene Feed-Meldungen + Umsatztrend + Support-Aktivität.

### Phase B – Pläne & Freischaltungen (Grundlage für alles Weitere)

- [x] **B1 Funktions-Register** (O) – erledigt 10.10.2026
  - Dateien: neu `src/lib/plans.ts`.
  - Inhalt: `type PlanKey = 'basis' | 'marketing_starter' | 'marketing_pro'`; `type FeatureKey =
    'crm_contacts' | 'crm_survey' | 'crm_social' | 'crm_pixel' | 'email_marketing' | 'social_campaigns' |
    'review_routing' | 'team_permissions' | 'online_shop' | 'speed' | 'reports_pro'`;
    `FEATURE_PLAN: Record<FeatureKey, PlanKey | 'addon'>`; `ROUTE_FEATURE: [prefix, FeatureKey][]`
    (`/leads/kontakte`→crm_contacts, `/leads/umfrage`→crm_survey, `/leads/social`→crm_social,
    `/leads/pixel`→crm_pixel, `/marketing/email`→email_marketing, `/shop`→online_shop, `/users`→speed).
  - Hook `useEntitlements()` → `{ plan, has(feature), loading }`. Übergangsweise: `plan = 'marketing_starter'`
    für alle Parks (kein Bruch!), Add-ons wie bisher (`hasGuestActivity`; Online-Shop überall noch Upgrade).
    Zusätzlich: `featureForPath(pathname)`, `planIncludes(plan, feature)`, `PLAN_LABEL_KEY` (Texte `plans.*` mit B3).
  - Fertig, wenn: tsc grün, noch keine sichtbare Änderung.
- [x] **B2 Tabelle `park_entitlements`** (O) – erledigt 10.10.2026 – Voraussetzung B1.
  **Code fertig 10.10.2026 (Codex, von Opus geprüft und angepasst); Aktivierung offen.**
  Die Supabase-CLI auf Johns Mac ist mit einem anderen Konto angemeldet (sieht nur „CRM“ und
  „Kirmes Kompass“) → 403. John meldet sich mit dem Liftpictures-Konto an (`npx supabase login`), dann:
  1. `npx supabase functions deploy operator-entitlements admin-park-entitlements --project-ref kvpcwlcfgmsmarjtwpsx`
  2. John spielt `supabase/migrations/20261010120000_park_entitlements.sql` im SQL-Editor (shared) ein.
  3. Im Browser prüfen: Profilmenü zeigt „Plan: Marketing Starter“, CRM offen.
  **Fehlerverhalten (verbindlich):** Scheitert der Abruf, wird NICHT gesperrt – letzter bekannter Stand des
  Parks, sonst Übergangsregel (Starter). Nur der allererste Abruf zeigt kurz „Lädt“. Deshalb darf der
  Frontend-Stand auch vor Schritt 1–2 veröffentlicht werden. Nicht wieder auf „bei Fehler sperren“ umbauen.
  Für S1 merken: `admin-park-entitlements` setzt beim Speichern immer `source='manual'` – sobald Stripe
  Zeilen schreibt, dort Überschreiben von `source='stripe'` verhindern.
  - Migration (shared, `supabase/migrations/2026101012…_park_entitlements.sql`):
    `park_id uuid references parks, plan text check in (...), features text[] default '{}',
    status text check in ('active','trial','paused','cancelled'), trial_until date, source text
    check in ('manual','stripe'), stripe_subscription_id text, updated_at timestamptz, primary key(park_id)`.
    RLS an; Lesen nur über Edge Function.
  - Edge Function `operator-entitlements` (GET, Muster `operator-survey`: verify_jwt=false + eigene
    Park-Prüfung), Staff schreibt über `admin-park-entitlements` (Muster `admin-park-equipment`).
  - `useEntitlements()` liest daraus; fehlt eine Zeile → Übergangsregel aus B1.
  - SQL an John übergeben (pbcopy + Link), nicht ausführen.
- [x] **B3 Kennzeichnung in Navigation und Seiten** (S) – erledigt 10.10.2026 – Voraussetzung B1.
  - `Sidebar.tsx`: Gruppenüberschriften „Betrieb“ / „Marketing“ (klein, `text-[11px] text-slate-500`,
    nur bei ausgeklappter Leiste); gesperrte Einträge mit Upgrade-Symbol (`ArrowUpCircle`, wie
    `UpgradeBadge`) statt Text, Tooltip „Teil von Marketing Starter“. „(Upgrade)“ bei Online-Shop/
    Speedmessung bleibt (Johns Wunsch).
  - Neuer Baustein `src/components/upgrade/PlanGate.tsx`: `<PlanGate feature="crm_survey">…</PlanGate>`
    zeigt bei fehlender Freischaltung `UpgradeHero` mit Plan-Namen und Button „Pläne ansehen“ (→ /plaene).
  - Profilmenü (`TopBar.tsx` → `ProfileMenu`): Zeile „Plan: Basis“ + Link „Pläne ansehen“.
  - Texte: `plans.*` (7 Sprachen).
- [x] **B4 Seite „Pläne“ `/plaene`** (S) – erledigt 10.10.2026 – Voraussetzung B1.
  - Datei `src/pages/Plans.tsx`, Route in `App.tsx`, Link im Profilmenü und in Upgrade-Seiten.
  - Aufbau: `UpgradePageHeader` → drei `PlanCard` (Basis/Starter/Pro, Pro hervorgehoben) → darunter
    Vergleichstabelle (Zeilen aus Abschnitt 3.1, Häkchen-Icons) → Add-ons als kleine Karten
    (Links auf bestehende Produktseiten `/configuration/produkt/:id`) → Einstiegsangebot als Hinweisbox.
  - „Anfragen“ ruft `meldeAusstattungsInteresse(parkId, { label: 'Plan anfragen: …' })` (wie
    `CrmPricing.tsx`). Preise als Konstanten oben in der Datei, Kommentar „von John bestätigen“.

### Phase C – Marketing-CRM

- [x] **C1 Navigation „Marketing-CRM“ mit Unterseiten** (S) – erledigt 10.10.2026 (E-Mail-Reiter kommt mit F1)
  - `crmTabs.ts`: Reihenfolge Start · Kontakte · E-Mail-Marketing · Social-Media-Kampagnen · Umfrage ·
    Werbe-Pixel. (E-Mail erst sichtbar, wenn F1 fertig.) „Übersicht“-Reiter heißt „Start“.
- [~] **C2 Startseite Marketing-CRM** (S – Entwurf in 6a) – umgesetzt 10.10.2026, Sichtprüfung offen
  - Datei: `Leads.tsx` Ansicht `overview` neu (Logik bleibt, Darstellung neu), am besten eigene
    Komponente `src/components/marketing/MarketingHome.tsx`.
  - Aufbau von oben: Kopf „Marketing-CRM“ + Plan-Abzeichen · **Einrichtungsassistent** (HubSpot
    „Setup guide“: 5 Schritte mit Haken – Freischaltung wählen, Kontaktfelder festlegen, Umfrage
    anlegen, Pixel eintragen, erste E-Mail senden; Fortschrittsbalken; einklappbar, Zustand in
    localStorage) · **Kennzahlen-Zeile** (neue Kontakte 30 Tage, Opt-in-Quote, NPS, E-Mail-Öffnungsrate
    sobald F vorhanden) · **Trichter** (verkaufte Fotos → Freischaltungen → Kontakte → Opt-ins →
    Newsletter geöffnet; horizontale Balken mit Prozent) · **Aktive Freischaltung** (heutige „Gerade
    aktiv“-Karte) · **Live-Vorschau** rechts (vorhanden) · Weltkarte nur auf Klick laden (C4).
- [~] **C3 Kontakte** (S, Spaltenauswahl + Kontakt-Schublade fertig; Segmente, Mehrfachaktion „Zu Segment“, Umfrage-Antworten/E-Mail-Verlauf in der Schublade offen): Tabelle mit Segment-Filtern (Sprache, Land, Opt-in, Quelle E-Mail/Umfrage/Social,
  Zeitraum), Spaltenauswahl, Mehrfachauswahl → „Zu Segment hinzufügen“ / „Löschen“ / „Exportieren“.
  Kontakt-Schublade (rechts, wie NotificationsDrawer) mit Foto, Freischaltdatum, Umfrage-Antworten,
  E-Mail-Verlauf.
- [~] **C4 Leistung CRM-Übersicht** (S) – Hauptursache behoben 10.10.2026, Messung am Gerät steht aus: Weltkarte erst nach Klick „Karte anzeigen“ rendern
  (`React.lazy`), Kontaktliste paginiert/virtuell (nur sichtbare Zeilen), schwere Berechnungen in
  `useMemo`. Fertig, wenn Imst-CRM in < 1 s bedienbar.

### Phase D – Umfrage neu

- [~] **D1 Auswertung** (S, umgesetzt ohne Antwortquote und Sprache-/Land-Filter, Sichtprüfung offen) – Datei `SurveyResultsView.tsx` neu gestalten:
  NPS-Kachel groß (Wert, Promoter/Passive/Kritiker als gestapelter Balken) · NPS-Verlauf je Woche
  (recharts Linie) · Antwortquote (Antworten ÷ Freischaltungen) · je Frage eine Karte: Skala →
  Balkendiagramm 0–10, Auswahl → horizontale Balken, Freitext → Liste mit Suche + Filter nach Wert ·
  Filterleiste oben: Zeitraum, Sprache, Land · Export CSV.
- [~] **D2 Fragen-Editor** (S, Vorlagen + Drag & Drop fertig; Fragetypen-Karten nicht umgebaut) – `SurveyManager.tsx`: Vorlagen (NPS, Zufriedenheit 1–5, „Wie hast du
  von uns erfahren?“, „Was können wir besser machen?“), Fragetypen-Auswahl als Karten, Reihenfolge per
  Drag & Drop (Muster Ebenen-Liste `OverlayBuilder.tsx`), Vorschau rechts.
- [~] **D3 Bewertungs-Weiterleitung (Pro)** (S, umgesetzt, Sichtprüfung offen – Entwurf in 6a, entschieden: Pro) – nach NPS ≥ 9 zeigt die Abholseite „Bewerte uns auf
  Google“ (Link aus Einstellungen). Feld `review_url` existiert schon (`review_*` in
  `park_survey_settings`) → prüfen und nutzen; Claim-Seite im Repo `imst`.

### Phase E – Social-Media-Kampagnen (auf Fotos zugeschnitten)

- [~] **E1 Kampagnen statt Einzelfeld** (S – Entwurf in 6a; Tabellen + Function geschrieben, WARTET auf SQL/Function-Einspielung durch John; Abholseiten im Repo `imst` lokal committet, nicht gepusht/deployt) – Datenmodell `park_social_campaigns` (shared): `id, park_id,
  name, type ('share_unlock'|'giveaway'|'record'), hashtag, mention, prize, starts_at, ends_at,
  status, rules_text, created_at`; `park_social_entries.campaign_id` hinzufügen.
  Kampagnentypen: **Teilen & freischalten** (heute), **Gewinnspiel** (Teilnahme = Teilen mit Hashtag,
  Ziehung im Dashboard, Teilnahmebedingungen-Vorlage), **Rekord-Challenge** (mit Speedmessung: „Schlag
  den Tagesrekord, teile dein Foto“).
- [~] **E2 Kampagnen-Seite** (S, umgesetzt im Social-Reiter, Sichtprüfung offen) – Liste der Kampagnen (Status-Chips), „Neue Kampagne“ als
  3-Schritt-Assistent (Typ → Details → Vorschau Abholseite), Detailseite mit Teilnehmern, Filter
  „geprüft/ungeprüft“, Ziehung („Gewinner ziehen“ → zufällig aus geprüften, protokolliert).
- [~] **E3 Teilen-Link mit Zähler + Moderation (Pro)** (S – Tabellen, Moderation, Rangliste, gewichtete Ziehung, Teilen-Link und Claim-Seite Imst fertig, wartet auf Deploy; ohne Vorschaubild – Entwurf in 6a, „E3“) – persönlicher Link
  je Gast mit Besucherzähler und Vorschaubild (Open Graph), Rechte-Häkchen, Moderationsgalerie,
  Rangliste „meiste Freunde“. Instagram-Abgleich ist gestrichen. Voraussetzung E1/E2. Teil der
  Änderungen liegt im Repo `imst` (Claim-Seiten: Link anzeigen + Häkchen).

### Phase F – E-Mail-Marketing

- [x] **F0 Make-Szenario** – erledigt 10.10.2026 durch Claude über den Make-Connector (Szenario 9950437, Webhook 4428097; Secrets gesetzt). Ursprünglich: (John) – Szenario „Park-E-Mails (Liftpictures)“ in Make anlegen (Webhook →
  Iterator über `recipients` → SMTP) und Secrets setzen, Beschreibung siehe 6a „F1“. Entschieden:
  Versand über Make wie im Liftpictures-CRM, kein Brevo/Resend. Offen: Vorgänge im Make-Tarif.
- [~] **F1 Tabellen, Make-Versand, Abmeldung, Öffnungszähler** (S – 10.10.2026 live eingerichtet: Tabellen, 4 Functions, Takt, Secrets; Test-Mail und Sichtprüfung offen).
  **Namen mit `park_`**, weil `email_campaigns`/`email_sends` im shared-Projekt dem Liftpictures-CRM gehören.
  Nur an Kontakte mit Einwilligung, `crm_marketing_opt_outs` beachten.
- [~] **F2 Editor** (S, umgesetzt als Reiter „E-Mail“ unter /leads/email; Sichtprüfung offen; je-Sprache-Fassungen und Foto-Platzhalter NICHT gebaut) – Seite `/marketing/email`: Liste (Entwurf/Geplant/Gesendet, Öffnungsrate) ·
  Editor mit Blöcken (Überschrift, Text, Bild, Button, Foto-des-Gastes-Platzhalter) · Sprache wählen
  (je Sprache eigene Fassung, Versand an Kontakte mit dieser Sprache) · Kontingent-Anzeige
  („1.240 von 2.000 E-Mails diesen Monat“) mit Upsell bei 80 %.
- [ ] **F3 Automationen (Pro)** (S – Entwurf in 6a) – Willkommens-Mail nach Freischaltung, „Saisonstart“-Mail an alle
  Opt-ins, „Dein Foto wartet noch“ (Erinnerung Online-Shop).

### Phase G – Ratgeber (Artikel)

- [ ] **G1 Datenmodell** (S – Entwurf in 6a) – Tabelle `articles` (shared): `id, slug unique, title, excerpt,
  body_md, cover_url, category ('tipps'|'marketing'|'technik'|'neu'), language, status
  ('draft'|'published'), published_at, author`. Bucket `article-images` (public).
  Lesen: Edge Function `public-articles` (nur published). Schreiben: `admin-articles` (Staff).
- [ ] **G2 Editor im Liftpictures-CRM (CRM-Repo)** (S) – neue Seite `/ratgeber` im Repo `liftpictures-crm` (Stil `src/staff`/`src/crm` dort):
  Liste, Editor (Titel, Kategorie, Sprache, Titelbild, Markdown mit Vorschau), Veröffentlichen.
  (Function `admin-articles` liegt im geteilten Projekt und wird von dort aufgerufen.)
- [~] **G3 Ratgeber im Betreiber-Dashboard** (S, mit 3 festen Artikeln umgesetzt; Anbindung an Tabelle `articles` + Editor G1/G2 offen, Sichtprüfung offen) – `/ratgeber` (Kartenraster, Kategorien-Filter),
  `/ratgeber/:slug` (Lesansicht, max. 720 px Textbreite, Titelbild, „Weitere Artikel“).
  Übersicht: Karte „Tipps für deinen Park“ (3 neueste). Hilfe-Center: Suche findet auch Artikel.

### Phase H – Mitarbeiter & Rechte

- [~] **H1 Datenmodell** (S – Entwurf in 6a; Code fertig, WARTET auf SQL im OPERATOR-Projekt + Function-Update durch John) – Spalte `organization_memberships.allowed_pages text[]` (null = Standard der
  Rolle). Rollen-Vorlagen im Code (`src/lib/permissions.ts`): **Betriebsleitung** (alles außer
  Mitarbeiter/Einstellungen), **Buchhaltung** (Übersicht, Umsatz, Käufe), **Marketing**
  (Marketing-CRM, Fotos, Personalisierung, Ratgeber), **Technik** (Systemzustand, Kamera, Fotos,
  Personalisierung, Support), **Kasse/Team** (Fotos, Systemzustand). `manage-staff` erweitern:
  `create` mit Rolle + Seiten, `update_permissions`, `deactivate`.
- [~] **H2 Seite Mitarbeiter neu** (S, umgesetzt; Sichtprüfung offen) – Tabelle (Name, E-Mail, Rolle, Seiten, zuletzt aktiv,
  Status) · „Mitarbeiter hinzufügen“ als Schublade: Name, E-Mail, Passwort, Rolle (Vorlagen als Karten)
  → darunter Häkchen-Matrix aller Seiten (vorbelegt aus Vorlage, änderbar) · Bearbeiten/Deaktivieren.
- [~] **H3 Durchsetzen** (S, Oberfläche fertig; serverseitige Prüfung im Code fertig, 5 Functions am 10.10.2026 deployt; `external-leads` bewusst nicht, siehe Protokoll) – `Sidebar.tsx` filtert nach `allowed_pages`; neuer `PageGuard` in
  `App.tsx` statt nur `OwnerOnly`; Edge Functions prüfen das Recht serverseitig (Entwurf in 6a, „H3 serverseitig“).

### Phase I – Seiten aufwerten

- [~] **I1 Käufe** (S, Zahlungsart-Filter, Detail-Schublade, Handy-Karten fertig; Tageszwischenzeilen offen; Sichtprüfung offen) – Filterleiste (Zeitraum, Automat, Zahlungsart, Suche Bildnummer/Beleg),
  Tageszusammenfassung als Zwischenzeilen, Detail-Schublade je Kauf (Beleg, Kartenmarke, Abholung),
  Export CSV, Mobile als Karten.
- [~] **I2 Kamera** (S, Gestaltung angeglichen; Verlauf der Testfotos NICHT gebaut, Sichtprüfung offen) – Layout wie Systemzustand: Kopf mit Status je Kamera, großes letztes Foto
  mit Zeitstempel, Testfoto-Button prominent, Einstellungen (an/aus/auto) als Segment-Schalter mit
  Erklärung, Verlauf der letzten Testfotos.
- [~] **I3 Support** (S, Hilfe-Vorschläge im Ticket-Formular + Telefon in Kontaktkarte; Liste/Chat gab es schon, Kategorie nicht gebaut; Sichtprüfung offen) – Ticketliste links (Status-Chips), Gesprächsansicht rechts im Chat-Stil
  (HubSpot Help Desk), „Neues Ticket“: vor dem Absenden passende Hilfe-Artikel vorschlagen
  (`helpContent.ts`), Kategorie + Dringlichkeit, Kontaktkarte (Telefon/E-Mail aus `helpContent.ts`).

### Phase M – Mobil (Smartphone)

- [~] **M1 Mobile Kopfzeile + Tab-Leiste** (S, umgesetzt, Sichtprüfung am Handy offen) – < 901 px: oben schmale Leiste (Parkname, Glocke mit
  Zähler, Hilfe, Profil – dieselben Panels aus `TopBar.tsx`, Schublade dann 100 % breit); unten feste
  Tab-Leiste: Übersicht · Umsatz · Systemzustand · Benachrichtigungen · Mehr (öffnet heutige Seitenleiste).
  Heutigen runden Menü-Knopf ersetzen.
- [~] **M2 Tabellen & Karten** (S, DataTable-Kartenansicht fertig; Overlay-Studio-Werkzeugleiste unten NICHT umgebaut) – `DataTable`: unter 640 px Kartenansicht (Hauptspalte fett, 2–3
  Nebenwerte); Kennzahl-Raster 2-spaltig; Seitenköpfe umbrechen; Overlay-Studio auf dem Handy:
  Werkzeuge als untere Leiste.
- [~] **M3 Prüfliste** (per CSS-Regeln unter 640 px erledigt, echte Prüfung je Seite bei 375/390/430 px offen) – jede Seite bei 375/390/430 px: kein seitliches Scrollen, Buttons ≥ 40 px hoch,
  Text ≥ 13 px.

### Phase R – Rest aus dem Redesign-Plan (Gestaltung, keine neuen Funktionen)

Herkunft: `docs/REDESIGN_PLAN.md` Phasen 4–9. Dort erledigt: Phase 1–3, Personalisierung, Systemzustand,
Leiste oben rechts. CRM-Gestaltung steckt in Phase C/D, Käufe/Kamera/Support in Phase I, Handy in Phase M.

- [~] **R1 Übersicht + Umsatz** (S) – Gestaltung angeglichen 10.10.2026, Sichtprüfung steht aus – `Overview.tsx`, `Revenue.tsx`, `ZahlungsUebersicht.tsx`,
  `AutomatenUebersicht.tsx`, `KPICard.tsx`: KPI-Karten im Stil der Kennzahl (Abschnitt 4), Diagramm-Karten
  mit Kopfzeile, Zeitraum-Schalter als Segment-Schalter. Diagramm-Animationen behalten. Keine Texte ändern.
- [~] **R2 Einstellungen** (S, umgesetzt, Sichtprüfung offen) – `Settings.tsx`: links Unternavigation (Sprache, Profil, Organisation,
  Bildpreis, Öffnungszeiten, Benachrichtigungen, Stripe), rechts Formulare in Karten, Speichern-Leiste
  unten fixiert. Alle Felder und Funktionen bleiben; Sprungmarke `#benachrichtigungen` muss weiter gehen.
- [~] **R3 Online-Shop, Speedmessung, Konfiguration, Fotos, Mitarbeiter-Liste, Login** (S, Muster angewendet, Sichtprüfung offen; Login bewusst unverändert) – an die
  Bausteine aus Abschnitt 4 angleichen (Seitenkopf, Karten, Buttons, Chips). Nur Gestaltung.
- [~] **R4 Feinschliff** (S, Modal + Fokus-Ringe erledigt; Leerzustände/Skeletons/Tooltips offen) – Leerzustände wie `EmptyNotifications`, Skeletons statt Spinner beim
  ersten Laden, EINE `Modal`-Komponente (`src/components/ui/Modal.tsx`) für alle Dialoge, Fokus-Ringe
  sichtbar, Tooltips einheitlich.

### Phase S – Stripe & Liftpictures-CRM (später)

- [ ] **S1 Stripe Billing** (S – Entwurf in 6a) – Produkte/Preise je Plan + Add-on, Checkout-Session aus `/plaene`,
  Kundenportal-Link im Profilmenü, Webhook → `park_entitlements` (`source='stripe'`).
- [ ] **S2 Liftpictures-CRM: Kunden-Freischaltungen (CRM-Repo)** (S) – im Repo `liftpictures-crm` unter „Kundenmanagement“ ein Reiter
  „Plan & Add-ons“: Plan setzen, Testzeitraum, Pausieren, Verlauf.

## 6a. Entwürfe für die (O)-Aufgaben (fertig ausgeschrieben – damit sind sie (S))

Geschrieben von Opus am 10.10.2026. Wer eine dieser Aufgaben umsetzt, hält sich an Tabellen, Namen und
Schnittstellen hier. SQL immer als Migration ablegen und John als Codeblock + Link geben (nie ausführen).
„shared“ = `kvpcwlcfgmsmarjtwpsx`, „operator“ = `xcrxltiiovpoladpaewd`.

Gemeinsame Muster für neue Functions im shared-Projekt:
- Betreiber-Functions: `verify_jwt = false` in `supabase/config.toml`, Prüfung mit
  `requireOperatorForPark(req, parkId)` aus `_shared/operatorAuth.ts`, Antworten mit `json()` /
  `handleOptions()` aus `_shared/sameProjectAdminAuth.ts` (Vorlage: `operator-entitlements/index.ts`).
- Staff-Functions: `requireAdminFromRequest(req)` (Vorlage: `admin-park-entitlements/index.ts`).
- Tabellen: RLS an, **keine** Client-Policies, `revoke all … from public, anon, authenticated`,
  Zugriff nur über Functions (Vorlage: Migration `20261010120000_park_entitlements.sql`).
- Frontend-Abruf: `fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/<name>`)` mit
  `Authorization: Bearer <session.access_token>` und `apikey: EXTERNAL_SUPABASE_ANON_KEY`
  (Vorlage: `fetchEntitlements` in `src/lib/plans.ts`).

### C2 – Startseite Marketing-CRM

Datei neu: `src/components/marketing/MarketingHome.tsx`. `Leads.tsx` rendert sie in der Ansicht
`overview` anstelle des heutigen Übersichts-Rasters und reicht die dort schon berechneten Werte als
Props durch (nichts neu laden): `leads`, verkaufte Fotos, Opt-ins, Umfragewerte (Antworten, Ø, NPS),
aktiver Freischaltmodus, Social-Status, Vorschau-URL.

Aufbau von oben nach unten (Desktop: linke Spalte flexibel, rechte Spalte 380 px mit Live-Vorschau;
unter 1280 px einspaltig, Vorschau zuletzt):

1. **Einrichtungsassistent** (`GlassCard`, einklappbar): Titel `mk.setup_title`, Fortschrittsbalken
   (`h-1.5 rounded-full bg-slate-200`, Füllung `bg-brand-600`), fünf Zeilen mit Kreis-Haken
   (erledigt: `CheckCircle2 text-emerald-600`, offen: leerer Kreis) und Link „Öffnen“:
   | Schritt | erledigt, wenn | Link |
   |---|---|---|
   | Freischaltung gewählt | `config.settings.mode` gesetzt | `/leads` (Karte „Gerade aktiv“) |
   | Erste Kontakte gesammelt | `leads.length > 0` | `/leads/kontakte` |
   | Umfrage angelegt | mindestens 1 Frage | `/leads/umfrage` |
   | Werbe-Pixel eingetragen | Tracking `enabled` und eine ID | `/leads/pixel` |
   | Bewertungslink hinterlegt | `settings.review_url` nicht leer | `/leads/umfrage` |
   Ausblenden, wenn alle fünf erledigt oder weggeklickt (`localStorage` `lp-crm-setup:<parkId>` = `hidden`).
2. **Kennzahlen-Zeile** (4 Kacheln, Baustein „Kennzahl“): Neue Kontakte (30 Tage) · Opt-in-Quote ·
   NPS · Antworten Umfrage (30 Tage). Unter jeder Zahl klein der Vergleich zu den 30 Tagen davor
   (`+12 %` grün / `−8 %` rot, nur wenn beide Werte > 0).
3. **Trichter** (`GlassCard`, Titel `mk.funnel_title`): drei waagerechte Balken untereinander,
   Breite relativ zum ersten: Verkaufte Fotos → Kontakte → Mit Einwilligung. Rechts neben jedem
   Balken Zahl und Prozent vom vorherigen Schritt. Balkenfarbe `bg-brand-600`, `bg-brand-400`, `bg-brand-300`.
4. **Gerade aktiv** + **Zeit zwischen Kauf und Einlösung**: die heutigen Karten, unverändert im Inhalt.
5. **Besucher nach Standort**: Karte zunächst nur als Länderliste (Top 5 mit Balken). Button
   „Karte anzeigen“ lädt die Weltkarte per `React.lazy` (gehört zu C4).

Texte: Schlüssel `mk.*` in 7 Sprachen. Keine neuen Abrufe, keine Datenbankänderung.

### D3 – Bewertungs-Weiterleitung

Gibt es technisch schon: `park_survey_settings.review_url`, `review_min_score`, `review_text` und die
Abholseiten zeigen den Link ab dem Mindestwert. **Entschieden: Pro** (Abschnitt 7, Punkt 4) mit
Bestandsschutz. Umsetzung: im `SurveyManager` den Bewertungs-Block in `PlanGate feature="review_routing"`
legen; Parks mit vorhandenem `review_url` erhalten die Zusatzfunktion (siehe Abschnitt 7).

### E1 – Social-Media-Kampagnen: Datenmodell und Schnittstelle (shared)

```sql
create table public.park_social_campaigns (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  name text not null,
  type text not null check (type in ('share_unlock', 'giveaway', 'record')),
  status text not null default 'draft' check (status in ('draft', 'active', 'ended')),
  hashtag text,
  mention text,
  prize text,
  rules_text jsonb not null default '{}'::jsonb,   -- je Sprache: {"de": "...", "en": "..."}
  starts_at timestamptz,
  ends_at timestamptz,
  winner_entry_id uuid,
  drawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index park_social_campaigns_park_idx on public.park_social_campaigns (park_id, status);
-- höchstens eine aktive Kampagne je Park
create unique index park_social_campaigns_one_active on public.park_social_campaigns (park_id) where status = 'active';
alter table public.park_social_campaigns enable row level security;
revoke all on table public.park_social_campaigns from public, anon, authenticated;

alter table public.park_social_entries
  add column if not exists campaign_id uuid references public.park_social_campaigns(id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by text check (verified_by in ('manual', 'instagram'));
create index if not exists park_social_entries_campaign_idx on public.park_social_entries (campaign_id);
```

Function `operator-social-campaigns` (shared, Betreiber):
- `GET ?park_id=` → `{ data: { campaigns: [… + entries_total, entries_verified], active_id } }`
- `GET ?park_id=&campaign_id=` → Kampagne + `entries` (id, name, handle, platform, post_url,
  giveaway_opt_in, verified_at, created_at; E-Mail/Telefon nur maskiert `a***@x.de`)
- `POST { park_id, action: 'save', campaign: {…} }` (anlegen/ändern; `status` nur draft/active/ended)
- `POST { park_id, action: 'verify', entry_id, verified: boolean }` → setzt `verified_at`, `verified_by='manual'`
- `POST { park_id, action: 'draw', campaign_id }` → zufällig **serverseitig** aus Einträgen mit
  `giveaway_opt_in = true` und `verified_at is not null`; schreibt `winner_entry_id`, `drawn_at`;
  zweiter Aufruf liefert denselben Gewinner (nicht neu ziehen), außer `redraw: true`.
- Aktivieren einer Kampagne beendet die bisher aktive (`status='ended'`).

Abholseiten (Repo `imst`, Functions `*-social-submit`): beim Eintrag die aktive Kampagne des Parks
suchen (`status='active'` und innerhalb `starts_at/ends_at`) und `campaign_id` setzen; Hashtag,
Erwähnung, Preis und Teilnahmebedingungen aus der Kampagne statt aus `park_survey_settings.social`
anzeigen (ohne aktive Kampagne: wie heute). Kampagnentyp `record` zeigt zusätzlich den Tagesrekord
aus der Rangliste.

Plan-Zuordnung: Typ `share_unlock` = `crm_social` (Starter), `giveaway`/`record`/Ziehung =
`social_campaigns` (Pro).

### E3 – Teilen-Link mit Zähler statt Instagram-Anbindung

**Entscheidung John 10.10.2026:** Keine Meta-App-Freigabe abwarten, sondern etwas, das andere Tools
(Gleam, Viral Loops, Wyng, Woobox) ebenfalls tun und das wir selbst nachprüfen können:

1. **Persönlicher Teilen-Link mit Zähler** (Empfehlungs-Mechanik, „Viral-Loop“): Jeder Gast bekommt
   nach der Freischaltung einen eigenen Link zu seinem Foto. Wer ihn teilt und Freunde draufklicken,
   sammelt Besucher. Das ist **echt messbar** (anders als „hat jemand gepostet?“): Kampagnenregel z. B.
   „Wer die meisten Freunde auf sein Foto bringt, gewinnt“ oder „ab 5 Besuchern gibt es einen Rabatt-
   Code“. Auf der Abholseite zeigt ein Zähler „3 Freunde haben dein Foto gesehen“.
2. **Moderationsliste mit Rechte-Einwilligung** (Wyng/Tagger-Prinzip): Beim Teilen setzt der Gast ein
   Häkchen „Der Park darf mein Foto veröffentlichen“. Der Betreiber sieht die Einträge als Galerie,
   gibt die besten frei (`approved_at`) und darf sie dann auf der Website/Bildschirm zeigen. Das ist für
   Parks oft wertvoller als jede Prüfung auf Instagram.
3. **Gäste-Abstimmung „Foto des Tages“** (später): Freigegebene Bilder zeigt die Abholseite zur Wahl;
   Stimmen pro Gerät einmal. Gewinner = Tagessieger der Kampagne.
Instagram-/Meta-Abgleich bleibt als späte Option, nicht Teil der ersten Fassung.

Datenmodell (shared):
```sql
create table public.park_share_links (
  token text primary key,                       -- 10 Zeichen, zufällig (base32)
  park_id uuid not null references public.parks(id) on delete cascade,
  claim_id uuid not null,                       -- photo_claims.id des Gastes
  campaign_id uuid references public.park_social_campaigns(id) on delete set null,
  visits integer not null default 0,
  unique_visitors integer not null default 0,
  created_at timestamptz not null default now(),
  unique (claim_id)
);
create table public.park_share_visits (
  token text not null references public.park_share_links(token) on delete cascade,
  visitor_hash text not null,                   -- SHA-256(IP + User-Agent + Tag + Secret), keine Rohdaten
  day date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (token, visitor_hash, day)
);
alter table public.park_share_links enable row level security;
alter table public.park_share_visits enable row level security;
revoke all on table public.park_share_links, public.park_share_visits from public, anon, authenticated;

alter table public.park_social_entries
  add column if not exists photo_rights boolean not null default false,
  add column if not exists approved_at timestamptz;
```
Functions:
- `park-share-link` (öffentlich, vom Claim-Seiten-Code aufgerufen; Schutz: nur mit gültigem
  `claim_id` + Abholcode): legt den Link an oder liefert den bestehenden, antwortet mit
  `{ url, visits }`. `url` = `<SUPABASE_URL>/functions/v1/park-share-visit?t=<token>`.
- `park-share-visit` (öffentlich, `verify_jwt=false`): zählt den Aufruf (ein Besucher je Tag nur
  einmal, eigene Besuche des Gastes nicht: Cookie/Parameter `own=1` auslassen), liefert eine kleine
  **HTML-Seite mit Open-Graph-Angaben** (`og:image` = verkleinertes Vorschaubild mit Wasserzeichen,
  `og:title` = Park + Kampagne) und leitet Menschen sofort auf die Abholseite des Parks weiter. Nur so
  zeigen WhatsApp/Instagram/Facebook beim Teilen ein Vorschaubild – die Abholseiten selbst sind
  Single-Page-Apps ohne Vorschau für Crawler.
- `operator-social-campaigns`: Aktion `leaderboard` (Top 20 nach `unique_visitors`), Aktion `approve`
  (setzt `approved_at`, nur bei `photo_rights = true`); `draw` kann zusätzlich „nach Besuchern
  gewichten“ (Lose = 1 + unique_visitors, Obergrenze 10).
- Pro-Funktion `social_campaigns`; der einfache Link im Starter-Plan bleibt die heutige Teilen-Freischaltung.

### F1 – E-Mail-Marketing: Datenmodell und Versand über Make (shared)

**Entscheidung John 10.10.2026:** Versand selbst über **Make.com**, wie im Liftpictures-CRM
(`liftpictures-crm/supabase/functions/_shared/sendCampaignCore.ts`). Kein Brevo/Resend.

**ACHTUNG Namen:** Im shared-Projekt gibt es schon `email_campaigns`, `email_campaign_recipients`,
`email_sends` und `crm_marketing_opt_outs` (Liftpictures-CRM) sowie die Functions `send-campaign`,
`dispatch-scheduled-campaigns`, `track-open`, `email-unsubscribe`, `preview-email-audience`.
Alles für die Parks heißt deshalb `park_email_*` bzw. `park-email-*`. Bestehende Tabellen/Functions
nicht anfassen.

Wie der Versand läuft (nach dem Vorbild des CRM): Die Function baut je Empfänger das fertige HTML
(Platzhalter ersetzt, Öffnungs-Pixel, Abmeldelink, Pflicht-Fuß) und schickt **Blöcke zu je 100
Empfängern** als ein Aufruf an den Make-Webhook:
`POST $MAKE_PARK_EMAIL_WEBHOOK_URL` mit `{ recipients: [{ to, subject, html }], fromName, fromEmail,
replyTo }`. Das Make-Szenario („Park-E-Mails (Liftpictures)“) durchläuft die Liste per Iterator und
sendet über die SMTP-Verbindung. `fromEmail` ist die Liftpictures-Adresse (Secret
`PARK_EMAIL_FROM_ADDRESS`), `fromName` = Parkname, `replyTo` = die Adresse des Parks – so braucht kein
Park eine eigene Domain. (Später je Park eigene Absenderdomain möglich.) Make-Webhooks antworten sofort
mit „Accepted“, das Szenario läuft im Hintergrund.

Make-Kosten: je E-Mail zählt mindestens ein Vorgang (Iterator + SMTP ≈ 2). 2.000 Mails ≈ 4.000
Vorgänge/Monat je Park – vor dem Start mit Johns Make-Tarif abgleichen und Kontingente je Plan
danach festlegen. Die Zahlen unten (2.000/10.000) sind Vorschläge.

Johns Aufgaben außerhalb des Codes: Make-Szenario anlegen (Webhook → Iterator über `recipients` →
SMTP „E-Mail senden“ mit `fromName`, `fromEmail`, `replyTo`, `to`, `subject`, `html`), die
Webhook-URL als Secret `MAKE_PARK_EMAIL_WEBHOOK_URL` hinterlegen, `PARK_EMAIL_FROM_ADDRESS`,
`EMAIL_LINK_SECRET` setzen.

```sql
create table public.park_email_settings (
  park_id uuid primary key references public.parks(id) on delete cascade,
  sender_name text not null,
  reply_to text not null,
  footer_address text not null,          -- Pflichtangabe im Fuß jeder Mail (Anbieterkennzeichnung)
  updated_at timestamptz not null default now()
);

create table public.park_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  name text not null,
  subject text not null default '',
  preheader text not null default '',
  language text,                          -- null = alle Sprachen
  body_json jsonb not null default '[]'::jsonb,
  html text not null default '',          -- vom Editor fertig erzeugt
  segment jsonb not null default '{}'::jsonb,  -- {"countries": [...], "since": "2026-05-01"}
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipients integer not null default 0,
  opened integer not null default 0,
  clicked integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index park_email_campaigns_park_idx on public.park_email_campaigns (park_id, created_at desc);

create table public.park_email_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.park_email_campaigns(id) on delete cascade,
  park_id uuid not null,
  claim_id uuid,
  email text not null,
  status text not null default 'queued' check (status in ('queued', 'handed_over', 'failed', 'skipped')),
  send_after timestamptz not null default now(),
  handed_over_at timestamptz,             -- an Make übergeben (Make meldet nichts zurück)
  opened_at timestamptz,
  error text,
  unique (campaign_id, email)
);
create index park_email_sends_queue_idx on public.park_email_sends (status, send_after) where status = 'queued';

create table public.park_email_usage (
  park_id uuid not null references public.parks(id) on delete cascade,
  month date not null,                    -- erster Tag des Monats
  sent integer not null default 0,
  primary key (park_id, month)
);

alter table public.park_entitlements add column if not exists email_extra_quota integer not null default 0;

alter table public.park_email_settings enable row level security;
alter table public.park_email_campaigns enable row level security;
alter table public.park_email_sends enable row level security;
alter table public.park_email_usage enable row level security;
revoke all on table public.park_email_settings, public.park_email_campaigns, public.park_email_sends, public.park_email_usage
  from public, anon, authenticated;
```

Empfänger: `photo_claims` mit `park_id`, `marketing_opt_in = true`, `email is not null`, je
`lower(email)` nur einmal (neuester Eintrag), optional `locale = language` und Segmentfilter.
**Nie** an Kontakte ohne Einwilligung. Zusätzlich E-Mails aus `crm_marketing_opt_outs` ausschließen
(gemeinsame Abmeldeliste), und jede Abmeldung über unseren Link trägt dort ebenfalls ein.

Kontingent je Monat (Vorschlag): Starter 2.000, Pro 10.000, plus `email_extra_quota`. Konstanten in
`_shared/emailQuota.ts` und gespiegelt in `src/lib/plans.ts` (`EMAIL_QUOTA`).

Functions (alle neu, Namen mit `park-`):
- `operator-email-campaigns` (Betreiber): `GET ?park_id=` (Liste + `usage: { sent, quota }` +
  `settings`), `GET ?park_id=&id=`, `POST action: 'save' | 'delete' | 'save_settings' |
  'preview_audience'` (nur die Anzahl) `| 'test'` (eine Mail an den angemeldeten Betreiber, zählt nicht
  aufs Kontingent) `| 'send'` (prüft Einstellungen vollständig, Kontingent, Betreff → schreibt
  `park_email_sends`, `status='sending'`).
- `park-email-dispatch` (pg_cron jede Minute, `verify_jwt=false`, geheimer Header): nimmt bis zu 3 Blöcke
  à 100 `queued` mit `send_after <= now()`, baut HTML je Empfänger, ruft den Make-Webhook, setzt
  `handed_over`/`failed`, erhöht `park_email_usage.sent`; alle erledigt → `status='sent'`, `sent_at`.
- `park-email-unsubscribe` (öffentlich): Link `…?c=<claim_id>&t=<HMAC>` (HMAC-SHA256 über claim_id mit
  `EMAIL_LINK_SECRET`) → `photo_claims.marketing_opt_in = false` für alle Einträge dieser E-Mail im
  Park + Eintrag in `crm_marketing_opt_outs`; schlichte Bestätigungsseite. Jede Mail trägt den Link
  im Fuß (Make kann die Kopfzeile `List-Unsubscribe` je nach SMTP-Modul mitgeben – wenn möglich setzen).
- `park-email-open` (öffentlich): 1×1-Bild `…?s=<send_id>` setzt `opened_at` einmalig, erhöht `opened`.
  Klicks werden nicht gezählt (kein Link-Umbau in der ersten Fassung).

Platzhalter, die der Server je Empfänger ersetzt: `{{name}}`, `{{park}}`, `{{unsubscribe_url}}`,
`{{open_pixel}}`. Der Editor (F2) erzeugt aus `body_json` das fertige `html` (Tabellenlayout, 600 px,
Inline-Stile). Blocktypen: `{type:'heading',text}`, `{type:'text',text}`, `{type:'image',url,alt}`,
`{type:'button',label,url}`, `{type:'divider'}`. Der Fuß (Absender, Adresse, Abmeldelink) wird vom
Server immer angehängt und ist nicht abschaltbar.

Frontend F2: Seite `/marketing/email` (Liste, Editor, Einstellungen), Navigation als Unterseite von
Marketing-CRM (`crmTabs.ts`), `ROUTE_FEATURE` enthält den Pfad schon.

### F3 – Automationen (Pro)

```sql
create table public.park_email_automations (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  type text not null check (type in ('welcome', 'season_start', 'photo_reminder')),
  enabled boolean not null default false,
  campaign_id uuid references public.park_email_campaigns(id) on delete set null,  -- dient als Vorlage
  delay_hours integer not null default 0,
  unique (park_id, type)
);
alter table public.park_email_automations enable row level security;
revoke all on table public.park_email_automations from public, anon, authenticated;
```
`welcome`: die `*-claim-submit`-Functions legen nach erfolgreicher Freischaltung mit Einwilligung eine
`park_email_sends`-Zeile an (`send_after = now() + delay`). `season_start`: Betreiber löst sie in der
Oberfläche aus (ein Klick = Kampagne an alle Opt-ins). `photo_reminder`: erst mit Online-Shop sinnvoll.

### G1 – Ratgeber: Datenmodell (shared)

```sql
create table public.ratgeber_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  language text not null default 'de',
  title text not null,
  excerpt text not null default '',
  body_md text not null default '',
  cover_url text,
  category text not null default 'tipps' check (category in ('tipps', 'marketing', 'technik', 'neu')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  author text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug, language)
);
create index ratgeber_articles_published_idx on public.ratgeber_articles (status, published_at desc);
alter table public.ratgeber_articles enable row level security;
revoke all on table public.ratgeber_articles from public, anon, authenticated;

insert into storage.buckets (id, name, public) values ('article-images', 'article-images', true)
on conflict (id) do nothing;
```
Functions: `public-articles` (`verify_jwt=false`, nur `status='published'`): `GET ?lang=de&category=`
→ Liste ohne `body_md`; `GET ?slug=&lang=` → ein Artikel, fehlt die Sprache → Fassung `de`.
`admin-articles` (Staff): `GET` (alle), `POST action: 'save' | 'publish' | 'unpublish' | 'delete'`,
Bild-Upload als multipart in den Bucket (Vorlage `admin-park-equipment`).
Darstellung im Dashboard: Markdown mit den Paketen `marked` + `dompurify` (neu installieren),
Textbreite max. 720 px.

### H1 – Mitarbeiter & Rechte: Datenmodell (operator)

```sql
alter table public.organization_memberships
  add column if not exists allowed_pages text[],        -- null = Standard der Rolle
  add column if not exists role_label text,             -- Anzeigename der Vorlage, z. B. 'Buchhaltung'
  add column if not exists disabled_at timestamptz;
```
Neu `src/lib/permissions.ts`:
- `PAGE_KEYS`: `overview '/'`, `revenue`, `purchases`, `photos`, `personalization`, `health`,
  `kamera`, `marketing '/leads'`, `shop`, `speed '/users'`, `configuration`, `tickets`, `team`,
  `settings` (Schlüssel = erster Pfadteil; `marketing` deckt alle `/leads/*` und `/marketing/*`).
- `ROLE_PRESETS`: Betriebsleitung (alles außer team, settings) · Buchhaltung (overview, revenue,
  purchases) · Marketing (marketing, photos, personalization) · Technik (health, kamera, photos,
  personalization, tickets) · Team (photos, health).
- `canSee(pageKey, { isOwner, role, allowedPages })`: Inhaber alles; `allowed_pages` gesetzt → nur
  diese; sonst wie heute (`staffAllowed`).
`AuthContext` liefert `allowedPages` aus der Mitgliedschaft. `Sidebar.tsx` und ein neuer `PageGuard`
(ersetzt `OwnerOnly` in `App.tsx`; ohne Recht → Weiterleitung zur ersten erlaubten Seite) nutzen `canSee`.

`manage-staff` (operator) erweitern, weiterhin nur `org_owner`:
`list` (+ `allowed_pages`, `role_label`, `disabled_at`, `last_sign_in_at`), `create { email,
password, full_name, role_label, allowed_pages }`, `update { user_id, role_label, allowed_pages }`,
`deactivate` / `reactivate` (setzt `disabled_at`; `AuthContext` meldet deaktivierte Nutzer ab),
`delete`. Limit je Plan (Basis 3, Starter 10, Pro unbegrenzt) serverseitig prüfen.

H3 serverseitig: `_shared/operatorAuth.ts` → `requireOperatorForPark` liefert zusätzlich `role` und
`allowedPages`; neue Hilfsfunktion `requirePage(auth, 'revenue')` → 403. Einbauen in
`operator-machine-revenue`, `operator-kiosk-purchases` (revenue/purchases), `operator-survey`,
`external-leads` (marketing), `manage-staff` (team). Inhaber und Staff-Admins immer erlaubt.

### S1 – Stripe-Abrechnung (später)

Stripe-Produkte: „Marketing Starter“, „Marketing Pro“ (je monatlich + jährlich), „Zusatz-E-Mails
10.000“. Preis-IDs als Secrets `STRIPE_PRICE_STARTER_MONTH` usw. (shared).

```sql
create table public.park_billing (
  park_id uuid primary key references public.parks(id) on delete cascade,
  stripe_customer_id text unique,
  updated_at timestamptz not null default now()
);
alter table public.park_billing enable row level security;
revoke all on table public.park_billing from public, anon, authenticated;
```
Functions (shared): `billing-checkout` (Betreiber, nur Inhaber; `POST { park_id, plan, interval }` →
Checkout-Session `mode: 'subscription'`, `metadata: { park_id, plan }`, 90 Tage Test über
`subscription_data.trial_period_days` für das Einstiegsangebot) · `billing-portal` (Link ins
Kundenportal: Zahlungsart, Rechnungen, kündigen, pausieren) · `billing-webhook`
(`verify_jwt=false`, Signatur prüfen): `checkout.session.completed`,
`customer.subscription.updated|deleted`, `invoice.payment_failed` → `park_entitlements` schreiben
mit `source='stripe'`, `stripe_subscription_id`, Status-Zuordnung `trialing→trial`,
`active→active`, `paused→paused`, `canceled|unpaid→cancelled`.
`admin-park-entitlements` darf Zeilen mit `source='stripe'` dann nicht mehr überschreiben (Fehler 409
mit Hinweis „über Stripe verwaltet“), außer `force: true`.
Saisonpause: `pause_collection` am Abo, im Portal aktivierbar.

## 7. Entscheidungen von John

**Entschieden am 10.10.2026:**
1. Marketing Pro kostet **149 €/Monat** (Starter 49 €). Preise stehen als Konstanten in `src/lib/plans.ts`
   bzw. `Plans.tsx`; „von John bestätigen“-Kommentar dort kann weg.
2. E-Mail-Versand **selbst über Make.com**, wie im Liftpictures-CRM (siehe F1). Kein Brevo/Resend.
3. Kein Instagram-Abgleich; stattdessen Teilen-Link mit Zähler + Moderationsliste (siehe E3).
4. Google-Bewertungs-Weiterleitung (`review_routing`) gehört in **Pro**. Bestandsschutz: Parks, die
   heute schon einen `review_url` eingetragen haben, bekommen `review_routing` als Zusatzfunktion in
   `park_entitlements.features`, sobald ihre Zeile angelegt wird; Abholseiten bleiben unverändert, nur
   die Einstellung im Dashboard (SurveyManager) liegt hinter `PlanGate feature="review_routing"`.
5. Ratgeber-Artikel: liegen auf LinkedIn, John liefert sie später (Sprache Deutsch zuerst).

**Noch offen:** Make-Tarif/Vorgänge für F1 (bestimmt die E-Mail-Kontingente je Plan).

## 8. Was bewusst NICHT gemacht wird

Kein eigener Social-Media-Planer für alle Netzwerke, kein Landingpage-Baukasten, keine Chatbots,
keine Vertriebs-Pipeline für Parks. Keine Preise ändern ohne John.

## 9. Protokoll

- 10.10.2026: Offene Redesign-Phasen 4–9 als Phase R übernommen; `REDESIGN_PLAN.md` ist ab jetzt nur Protokoll.
- 10.10.2026: Plan erstellt. A1 (Marketing-CRM) und A2 (Benachrichtigungen auf der Übersicht) umgesetzt.
  Dabei behoben: eine laufende Automaten-Störung erschien jeden Tag als neue Meldung (Kennung mit Datum).
  Jetzt eine Meldung je Störung, solange sie andauert (`active` in `notificationFeed.ts`); Schweregrad
  auf der Übersicht übersetzt („Warnung“ statt „warning“).
- 10.10.2026: B1 umgesetzt: `src/lib/plans.ts` (Plan-/Funktionsliste, Seiten-Zuordnung, `useEntitlements()` mit Übergangsregel). Noch nirgends eingebunden, keine sichtbare Änderung.
- 10.10.2026: B3 umgesetzt: Navigation in Gruppen Betrieb/Marketing/Verwaltung (`group` in `navItems`, Reihenfolge innerhalb der Gruppe frei per Drag & Drop), Upgrade-Symbol bei gesperrten Plan-Funktionen, `PlanGate`/`PlanBadge` (`src/components/upgrade/PlanGate.tsx`, um `/leads/*` gelegt), Profilmenü „Plan: …“. Links auf Pläne zeigen bis B4 auf `/leads/preise`. Durch die Übergangsregel ist noch nichts gesperrt.

- 10.10.2026: B3 (`ab0cb97`) auf Johns Auftrag gepusht; bolt.new benötigt Publish. B2-Code vorbereitet:
  Migration `20261010120000_park_entitlements.sql` (shared, RLS, keine Client-Rechte, keine Bestandsdaten),
  `operator-entitlements` (GET mit Park-Prüfung), `admin-park-entitlements` (GET/POST nur admin_users,
  validierte manuelle Einstellungen), `useEntitlements()` lädt je Park/Sitzung, bündelt parallele
  Anfragen und aktualisiert nach spätestens einer Minute bei sichtbarer Seite. Fehlende Zeile/Tabelle
  behält Starter-Übergang; pausiert/gekündigt/Test abgelaufen ergibt Basis ohne Zusatzfeatures.
  Test-Enddatum gilt einschließlich Europe/Berlin. Lade-/Netzfehler geben keine Funktionen frei;
  PlanGate zeigt vorhandene übersetzte Lade-/Fehlertexte, Profil/Navigation vermeiden falsche Plananzeigen.
  Prüfungen: i18n (1646 Schlüssel × 7), Build und Deno-Prüfung bestanden; tsc nur bekannte Altfehler.
  `node scripts/test-entitlements.mjs` prüft Planlogik, Testablauf, Park-/Sitzungswechsel und Fehler;
  `deno test --allow-env supabase/functions/operator-entitlements/entitlements_test.ts` prüft Auth,
  fremde Parks und Schreibvalidierung mit vollständig abgefangenen HTTP-Anfragen (kein SQL ausgeführt).
  Sichtprüfung localhost:5180 Desktop und 390 px: Fehleransicht korrekt, kein seitliches Scrollen.
  **Offen:** Deployment beider Functions auf kvpcwlcfgmsmarjtwpsx (403 bei CLI/Connector, auch Browser ohne
  Zugriff), John spielt SQL ein, dann normale Plananzeige live prüfen. Neuer Code nur lokal committet.
  Deployment nach Anmeldung: `npx supabase functions deploy operator-entitlements admin-park-entitlements
  --project-ref kvpcwlcfgmsmarjtwpsx --use-api`. Kein SQL ausgeführt, keine Pläne geändert.
- 10.10.2026: B2 von Codex gebaut (Migration, zwei Functions, `useEntitlements()` liest echt, Tests). Opus hat das Fehlerverhalten geändert: Abruffehler sperren nicht mehr (vorher Fehleransicht statt CRM, auch bei kurzem Netzaussetzer oder Token-Erneuerung), Abfrage alle 5 statt 1 Minute. Aktivierung wartet auf Supabase-Anmeldung mit dem Liftpictures-Konto.
- 10.10.2026: Abschnitt 6a ergänzt: Entwürfe (SQL, Functions, Seitenaufbau) für C2, D3, E1, E3, F1, F3, G1, H1/H3, S1. Alle Aufgaben sind damit für Sonnet/Codex umsetzbar.
- 10.10.2026: B2-Aktivierung ohne CLI (Supabase-CLI-Kontingent aufgebraucht, falsches Konto): beide Functions liegen als je EINE Datei in `supabase/dashboard-paste/` (zum Einfügen im Supabase-Editor, Import-frei bis auf supabase-js), dazu `B2_pruefen.sql`. Die Tabelle `park_entitlements` existierte beim Einspielen schon (Fehler 42P07) - erst mit `B2_pruefen.sql` den Stand ansehen, nicht erneut anlegen. WICHTIG im Editor: nach dem Deploy „Enforce JWT verification“ der Function AUSSCHALTEN (die Betreiber-Tokens kommen aus dem anderen Projekt).
- 10.10.2026: Entscheidungen von John eingetragen (Pro 149 €, Versand über Make, Teilen-Link statt Instagram, Bewertungslink in Pro, Artikel später). Tabellennamen für Parks mit `park_`-Präfix, weil `email_campaigns`/`email_sends` schon dem Liftpictures-CRM gehören.
- 10.10.2026: `operator-entitlements` wurde im Supabase-Editor angelegt; die Adresse ist `hyper-processor` (Editor vergibt Zufallsadressen, nicht änderbar). `src/lib/plans.ts` nutzt deshalb `ENTITLEMENTS_FUNCTION = 'hyper-processor'`. Beim Anlegen weiterer Functions im Editor immer die Adresse prüfen (Zeile unter dem Titel); per CLI gilt der gewählte Name.
- 10.10.2026: B2 aktiv. Tabelle `park_entitlements` im shared-Projekt (hat eine zusätzliche Spalte `notiz`, harmlos), beide Functions im Supabase-Editor angelegt, JWT-Prüfung aus. Adressen: `hyper-processor` (= operator-entitlements), `admin-park-entitlements`. Per curl geprüft: beide antworten 401 „Missing bearer token“ aus unserem Code. Noch offen: Sichtprüfung im Dashboard (Profilmenü „Plan: …“), sobald die Chrome-Erweiterung wieder verbunden ist; Pläne je Park setzt später das Staff-Dashboard.
- 10.10.2026: B4 umgesetzt: `src/pages/Plans.tsx`, Route `/plaene` (nur Inhaber). Drei Karten (Basis 0 €, Starter 49 €, Pro 149 € hervorgehoben, aktueller Plan markiert), Vergleichstabelle mit „In Entwicklung“-Marke für noch nicht gebaute Funktionen (E-Mail, Kampagnen, Berichte, Rechte je Seite), Add-ons als Links, Anfragen über `meldeAusstattungsInteresse`. Links: PlanGate und Profilmenü zeigen auf `/plaene`. Das Einstiegsangebot („3 Monate gratis bei zu wenig Kontakten“) ist NICHT auf der Seite – war nur ein Vorschlag, braucht Johns Freigabe. Sichtprüfung im Browser steht aus (Chrome-Verbindung getrennt).
- 10.10.2026: **Staff-/Super-Admin-Bereich aus diesem Repo entfernt** (John). `src/staff` (48 Dateien, ca. 23.600 Zeilen), `public/manifest-staff.webmanifest` und alle `/staff`-Routen sind weg; Repo von 66.154 auf 42.523 Zeilen in `src/`. Grund: `liftpictures-crm` hat alles schon (Kundenmanagement, Kameras, Liftpic-Setup, Support, Health, Kosten, Passwörter, Medien, Angebote …) und ist weiter (zusätzlich Ausstattung, Push-Einstellungen). Geprüft: einzige Kopplung war `getFunctionSession` (jetzt nur noch Betreiber-Sitzung). Sicherung: Git-Tag `staff-vor-entfernung-2026-10-10`. Der Mitarbeiter-Link in der Fußzeile ist bewusst entfernt (John kennt die CRM-Adresse); `/staff/*` führt zur Anmeldung. Aufgaben G2 und S2 gehören jetzt ins CRM-Repo. Mögliche spätere Aufräumarbeit: `embedded`-Zweige und `customer-embedded-*`-CSS in den Betreiber-Seiten (früher für die Einbettung im Staff-Kundenmanagement) – nur mit Sichtprüfung entfernen.
- 10.10.2026: C4 (Leistung CRM): Ursache war die 1,1-MB-Weltkarte (`public/world-map-gray.svg`, 2.091 Pfade) in `Leads.tsx`: bei jeder Mausbewegung wurde die Karte als Text neu gebaut, vom Browser neu eingelesen und zusätzlich unsichtbar neu aufgebaut, um Länderpositionen zu messen. Jetzt: Karte nur einmal (`buildWorldMapSvg`), Hervorhebung als kleines `<style>` (`buildWorldMapStyle`), Positionen einmal nach dem ersten Zeichnen (`resolveLeadMapPoints` in `useEffect` mit 50 ms Verzögerung), Hover höchstens einmal pro Bild (`requestAnimationFrame`). Aussehen unverändert. NOCH ZU PRÜFEN (Chrome war nicht verbunden): CRM bei Imst öffnen, Karte überfahren und Land anklicken, „Detaillierte Karte anzeigen“. Falls es noch hängt: Kontaktliste (815 Zeilen, `Leads.tsx` ab ca. 880, `leads.filter/sort` ohne `useMemo`) und `DataTable` prüfen; als nächster Schritt die Weltkarte erst nach Klick laden (`React.lazy`).
- 10.10.2026: R1 (Übersicht + Umsatz) per Muster-Austausch angeglichen, keine Funktionen/Texte geändert, Diagramme unberührt: Seitentitel leicht (28–32 px, `font-light`), große Zahlen leicht, KPI-Karte (`KPICard.tsx`) ruhiger (kleineres Symbol-Feld, leichte Zahl), Zeitraum-Schalter als Segment-Schalter (dunkel aktiv), halbtransparente Glas-Innenflächen (`bg-white/30…70`) → `bg-slate-50`, Rahmen `border-white/*` → `--line`, Live-Kacheln ohne Schatten/Blur/Hebe-Effekt, Großbuchstaben-Beschriftungen entfernt, Ladeplatzhalter `bg-slate-100`. Betroffen: `Overview.tsx`, `Revenue.tsx`, `ZahlungsUebersicht.tsx`, `AutomatenUebersicht.tsx`, `ui/KPICard.tsx`. NOCH ZU PRÜFEN (Chrome getrennt): Sichtprüfung Desktop + 390 px, hell + dunkel. Nicht gemacht: Diagramm-Karten mit eigener Kopfzeile mit Trennlinie, Umbau der Kennzahl-Zeile – nur nach Sichtprüfung angehen.
- 10.10.2026: R2 (Einstellungen): links Unternavigation (Profil, Organisation, Sprache, Bildpreis, Öffnungszeiten, Benachrichtigungen, Stripe; Markierung folgt dem Scrollen, auf dem Handy als waagrechte Chips), rechts eine Spalte mit den bestehenden Karten (jede als `<section id=…>`, Reihenfolge per `order-N`; der Anker `#benachrichtigungen` sitzt jetzt auf der Section). Alle Felder, Speichern-Knöpfe und Funktionen unverändert, keine neuen Texte (vorhandene Schlüssel). Bewusst KEINE feste Speichern-Leiste unten, weil jeder Abschnitt einzeln speichert. R1-Muster angewendet (leichter Titel, `bg-slate-50`, `--line`-Rahmen, keine Großbuchstaben-Beschriftungen). NOCH ZU PRÜFEN: Desktop + 390 px, hell + dunkel, Sprung `/settings#benachrichtigungen` (Glocke/Hinweis).
- 10.10.2026: R3 per Muster-Austausch wie R1 auf `Shop`, `Users` (Speedmessung), `Configuration` + `ConfigurationProduct/Orders/Faq`, `Photos`, `Team` angewendet: leichter Seitentitel (28–32 px), `bg-slate-50` statt Halbtransparent-Weiß, `--line`-Rahmen, keine Großbuchstaben-Beschriftungen. Keine Texte/Funktionen geändert. Nicht angefasst: `ShopPricing` (nichts zu ändern), `Login`/`Register` (Anmeldekarte, eigenes Layout), `Purchases`/`Kamera`/`Support` (kommen mit I1–I3). NOCH ZU PRÜFEN: Sichtprüfung Desktop + 390 px, hell + dunkel.
- 10.10.2026: R4 teilweise: neue `src/components/ui/Modal.tsx` (Esc schließt, Klick daneben schließt abschaltbar, `locked` während Aktionen, Scroll-Sperre, Fokus hinein und zurück, `role=dialog`); eingesetzt in Settings (Produkt-Auswahl, Klick daneben schließt dort bewusst NICHT) und Support (Ticket anlegen, Löschen bestätigen). Nicht umgestellt: `WelcomeTour` (Rundgang mit eigenem Ablauf), TopBar-Fenster (Seitenleiste/Hilfe), `Shop`-Vollbildvorschau, `DemoShop`-Warenkorb. Globaler Tastatur-Fokusring in `index.css` (`:where(a, button, select, …):focus-visible`). Offen: einheitliche Leerzustände und Skeletons (Seiten sind uneinheitlich, ohne Sichtprüfung nicht sicher umzubauen), Tooltips (keine `title`-Attribute vorhanden, noch kein Konzept).
- 10.10.2026: C1–C3. C1: Reiter-Reihenfolge Start · Kontakte · Social Media · Umfrage · Pixel (`crmTabs.ts`), erster Reiter heißt „Start“ (`crm.tab_start`), Reiterleiste ruhiger. C2: neue `src/components/marketing/MarketingHome.tsx` (Einrichtungsassistent mit Fortschritt, ausblendbar via `lp-crm-setup:<Park>`; vier Kennzahlen mit Vergleich zu den 30 Tagen davor; Trichter Verkaufte Fotos → Kontakte → Mit Einwilligung) oben in der Übersicht; die Kacheln Fotos verkauft/Gesamt/Opt-ins/Antworten/NPS aus `Leads.tsx` entfallen (stecken jetzt in Trichter/Kennzahlen), „Aktuelle Freischaltung“, Zufriedenheit und Social-Karte bleiben. Standort: Top-5-Länderliste statt kompakter Weltkarte; die 1,1-MB-Karte wird erst auf „Karte anzeigen“ geladen und vermessen (C4 Stufe 2). C3: Spaltenauswahl (`lp-crm-columns`) und Kontakt-Schublade (Klick auf die E-Mail) in der Kontaktliste. Neue Texte `mk.*` in 7 Sprachen. Offen bei C3: Segmente (braucht Tabelle, noch nicht angelegt), Umfrage-Antworten je Kontakt (liegen nicht je Kontakt vor) und E-Mail-Verlauf (kommt mit F).
- 10.10.2026: D1–D3. D1 (`SurveyResultsView.tsx`): Zeitraum als Segment-Schalter, CSV-Export (alle Fragen, Freitexte mit Datum/Score), große NPS-Kachel mit gestapeltem Balken Promoter/Neutral/Kritiker, Linie „Ø Score je Woche“ (recharts; ein echter NPS-Verlauf ist mit den Server-Daten nicht möglich, `timeline` hat nur Ø Score je Tag), Freitext-Suche ab 5 Antworten. NICHT gemacht: Antwortquote (Freischaltungen je Umfrage liefert `operator-survey` nicht) und Filter Sprache/Land (Server-Seite). D2 (`SurveyManager.tsx`): drei Vorlagen (Zufriedenheit 1–5, „Wie hast du von uns erfahren?“, „Was können wir besser machen?“), Fragen per Ziehgriff sortierbar (Pfeile bleiben), Vorschau rechts war schon da; Fragetypen-Auswahl bleibt als Knopfreihe. D3: Block „Google-Bewertung“ liegt hinter `review_routing` (Pro); gesperrt zeigt eine Karte mit Plan-Hinweis und Link zu `/plaene`. Bestandsschutz clientseitig: vorhandener `review_url` hält den Block offen; beim Laden der Berechtigungen ist er offen (nie sperren, siehe `plans.ts`). Abholseiten unverändert. Neue Texte `survey.*` (Promoter-Label, Vorlagen, Ziehhinweis) in 7 Sprachen.
- 10.10.2026: E1–E3 (Teil). Neu: Migration `supabase/migrations/20261010140000_social_campaigns.sql` (Tabellen `park_social_campaigns`, `park_share_links`, `park_share_visits`; Spalten `campaign_id`, `verified_at`, `verified_by`, `photo_rights`, `approved_at` an `park_social_entries`), Function `operator-social-campaigns` (Liste, Detail mit Rangliste, speichern, prüfen, freigeben, ziehen serverseitig mit Zufall aus `crypto`, optional nach Besuchern gewichtet 1–10 Lose; Kontakte maskiert; Aktivieren beendet die bisherige aktive Kampagne) als `supabase/functions/operator-social-campaigns/index.ts` und Ein-Datei-Fassung `supabase/dashboard-paste/operator-social-campaigns.ts` (mit `deno check` geprüft), Client `src/lib/socialCampaigns.ts`, UI `src/components/survey/CampaignsManager.tsx` oben im Social-Reiter (Liste mit Status-Chips, 3-Schritt-Assistent, Detail mit Teilnehmerprüfung, Rechte-Freigabe, Rangliste, Ziehung). Gewinnspiel und Rekord-Challenge sind clientseitig Pro (`social_campaigns`). Ohne eingespieltes SQL zeigt die Seite einen Hinweis (`migration_pending`). NOCH OFFEN: (1) John spielt SQL + Function ein (JWT-Prüfung der Function AUS), (2) Repo `imst`: Abholseiten/`*-social-submit` setzen `campaign_id`, zeigen Hashtag/Preis/Bedingungen der aktiven Kampagne, Häkchen „Foto darf veröffentlicht werden“ (`photo_rights`), (3) öffentliche Functions `park-share-link` und `park-share-visit` (Zähler, Open-Graph-Seite) – ohne sie bleibt die Rangliste leer, (4) Kampagnentyp `record` zeigt noch keinen Tagesrekord.
- 10.10.2026: M1–M3. M1: unter 901 px schmale Leiste oben (Parkname, Hilfe, Glocke mit Zähler, Profil – dieselben Fenster wie am Desktop, `TopBar.tsx`) und feste Tab-Leiste unten (Übersicht · Umsatz · Systemzustand · Benachrichtigungen · Mehr → öffnet die Seitenleiste); der runde Menü-Knopf ist entfernt. Seiteninhalt unten 80 px Platz, oben 64 px. Die Leisten sind fest verdrahtet (kein Ausblenden nach Plan/Kiosk-Freischaltung). M2: `DataTable` zeigt unter 640 px Karten (erste Spalte fett, Rest als Beschriftung/Wert in 2 Spalten, Auswahl-Kästchen und Löschen-Knopf oben), Spaltenbeschriftung darf jetzt ein Element sein (behebt den alten TypeScript-Fehler in `Leads.tsx`). Nicht gemacht: Werkzeugleiste unten im Overlay-Studio. M3: CSS-Regeln unter 640 px: Knöpfe/Eingaben mind. 40 px, Eingaben 16 px (kein iOS-Zoom), `text-xs` 13 px, 10/11-px-Texte 12 px (nicht ganz die geforderten 13 px). Echte Seite-für-Seite-Prüfung steht aus.
- 10.10.2026: I1–I3. I1 (`Purchases.tsx`): Filter Zahlungsart (zusätzlich zu Automat/Monat bzw. Quelle), Klick auf Kunde/Gerät öffnet Detail-Schublade (neue `src/components/ui/Drawer.tsx` + `DrawerRow`; Betrag, Status, Zahlungsart, Quelle, Beleg, Beschreibung), R1-Stil; Suche über Bildnummer/Beleg gab es (`reference`); Export und Handy-Karten (M2) vorhanden. Nicht gemacht: Tageszusammenfassung als Zwischenzeilen (bräuchte Gruppierung in `DataTable`). I2 (`Kamera.tsx`): nur Gestaltung – leichter Titel, Testfoto-Knopf als Primär-Knopf, „Bild neu laden“/Senden/Verwerfen als Standard-Knöpfe, An/Aus als Segment-Schalter, Hinweiskarten ruhiger; Verlauf der letzten Testfotos nicht gebaut (Daten fehlen). I3 (`Support.tsx`): Ticketliste links + Chat rechts gab es bereits; neu: beim „Neues Ticket“ werden anhand des Betreffs bis zu 3 passende Hilfe-Artikel (`HELP_ARTICLES`) als Links vorgeschlagen (`support.suggest_title`), Telefonnummer aus `helpContent.ts` in der Kontaktkarte, R1-Stil. Kategorie im Formular nicht gebaut (Ticket-Schema kennt keine).
- 10.10.2026: H1–H3 (Oberfläche). Neu: `supabase/migrations/20261010150000_staff_permissions.sql` (OPERATOR-Projekt `xcrxltiiovpoladpaewd`: `allowed_pages`, `role_label`, `disabled_at` an `organization_memberships`), `src/lib/permissions.ts` (Seitenschlüssel, Rollenvorlagen Betriebsleitung/Buchhaltung/Marketing/Technik/Team, `canSee`, `firstAllowedPath`; mit Deno-Test geprüft), `AuthContext` liefert `allowedPages` und meldet deaktivierte Zugänge ab, `Sidebar` und `OwnerOnly` nutzen `canSee`, `DashboardLayout` leitet ohne Recht zur ersten erlaubten Seite (auch bei getippter Adresse). `manage-staff` (Operator-Projekt, Ein-Datei-Fassung `supabase/dashboard-paste/manage-staff.ts`): `list` mit Rolle/Seiten/zuletzt aktiv, `create` mit Vorlage + Seiten, neu `update`, `deactivate`/`reactivate` (setzt zusätzlich `ban_duration` im Auth). `Team.tsx`: Rollenvorlagen + Seiten-Häkchen beim Anlegen, Liste mit Rolle, Seitenzahl, zuletzt aktiv, Status, Bearbeiten (Modal), Deaktivieren, Entfernen; Mitarbeiter-Limit je Plan (3/10/unbegrenzt) nur im Browser. Ohne eingespieltes SQL/Function-Update verhält sich alles wie bisher (Standard-Mitarbeiter sehen Fotos, Personalisierung, Support, Systemzustand, Kamera). OFFEN: (1) serverseitige Seitenprüfung `requirePage` in `_shared/operatorAuth.ts` und den Functions (shared-Projekt) – bis dahin sperren die Rechte nur die Oberfläche; (2) Limit serverseitig; (3) Seitenwechsel bei bereits angemeldeten Sitzungen greift erst nach `refreshProfile`/Neuladen.
- 10.10.2026: H3 serverseitig (Code). `_shared/operatorAuth.ts`: `requireOperatorForPark(req, parkId, pages?)` – mit Seitenliste werden Mitarbeiter mit eigener Seitenauswahl (`allowed_pages`) oder deaktiviertem Zugang abgewiesen (403); Inhaber, Staff-Admins und Mitarbeiter OHNE Auswahl bleiben unverändert; schlägt die Abfrage fehl, wird nicht gesperrt. Eingebaut in `operator-machine-revenue` und `operator-kiosk-purchases` (revenue/purchases/overview/marketing/speed), `external-leads` (marketing/overview), `operator-survey` und `operator-social-campaigns` (marketing), `operator-shop-settings` (shop). Neues Werkzeug `scripts/build-paste.py` erzeugt die Ein-Datei-Fassungen in `supabase/dashboard-paste/` (`--wrap` bei Namenskonflikt, nötig für `external-leads`). Bis die Functions im Supabase-Editor ersetzt sind, ändert sich nichts. Nicht abgedeckt: `operator-park-schedule`, `-notification-settings`, `-guest-users`, `external-users`, Stripe-Functions (nicht einer Seite zuordenbar bzw. von mehreren Seiten genutzt).
- 10.10.2026: E1/E3 Abholseite (Repo `imst`, lokal committet, NICHT gepusht – Push deployt live). Neu: `_shared/campaign.ts` (aktive Kampagne, tabellenfehler-sicher), öffentliche Function `imst-social-campaign` (Hashtag/Erwähnung/Preis/Bedingungen), `imst-claim-submit` ordnet den Social-Eintrag der aktiven Kampagne zu (`campaign_id`), `imst-claim-verify` ersetzt Hashtag/Erwähnung/Gewinnspiel durch die Kampagne und liefert den persönlichen Teilen-Link (`social.share`: Token + Besucher), `imst-social-submit` nimmt `photoRights` (Häkchen „Der Park darf mein Foto veröffentlichen“), neue öffentliche Function `imst-share-visit` zählt Besuche (`<Seite>/?ref=<token>`, Hash je Besucher und Tag, nur im Browser → Vorschau-Roboter zählen nicht). Claim-Seite: `SocialPanel` hängt den Teilen-Link an den Share-Text, zeigt „Freunde, die deinen Link geöffnet haben: n“, Rechte-Häkchen und die Teilnahmebedingungen; `Root.tsx` zählt `?ref=` einmal je Sitzung (nur Imst). Neue Texte in 10 Sprachen (`friendsSeen`, `photoRights`, `rulesTitle`). ABWEICHUNG vom Entwurf: KEINE Open-Graph-Vorschauseite mit Foto – Supabase Edge Functions liefern auf der Standard-Domain kein HTML (wird zu Text), und die Seite ist statisch gehostet; der Link zeigt also die allgemeine Vorschau der Seite. Aufgabe `park-share-link` entfällt (Link entsteht in `imst-claim-verify`). Ein-Datei-Fassungen: `imst/supabase/dashboard-paste/`. Tarzans/Plose/Grünberg unberührt.
- 10.10.2026: E2 Vorschau: im Kampagnen-Assistenten steht rechts (unter 1280 px darunter) eine Live-Vorschau der Abholseite (Teile-Text mit Erwähnung/Hashtag, Teilen-Knopf in der Parkfarbe, Beispiel-Zähler „3 Freunde“, Gewinnspiel-Block mit Preis, Teilnahmebedingungen, Rechte-Häkchen). Knopf „Beispiel einfügen“ füllt das Formular mit einer Imst-Beispielkampagne (nichts wird gespeichert, bis John speichert). Neue Texte `camp.example`, `camp.preview_*`.
- 10.10.2026: G3 vorgezogen mit festen Artikeln (John lieferte 3 LinkedIn-Artikel von Tom Nolting + Titelbilder). Neu: Seite `/ratgeber` (Kartenraster mit Titelbild, Datum, Sprache, Auszug) und `/ratgeber/:slug` (Titelbild, Text als einfache Absätze mit anklickbaren Adressen, Hinweis wenn der Artikel nicht in der eigenen Sprache ist), Ansprechpartner-Karte „Tom Nolting – CEO und Gründer“ mit Link zu seinem LinkedIn (`TOM_LINKEDIN_URL`), Seitenleiste „Ratgeber“ (Gruppe Verwaltung), Inhalte in `src/lib/ratgeber.ts`, Bilder in `public/ratgeber/` (von den LinkedIn-Links geladen, zwei PNG nach JPEG gewandelt). Artikel bleiben in ihrer Sprache (2× Deutsch, 1× Englisch); Oberflächentexte `nav.guide`, `ratgeber.*` in 7 Sprachen. Zuordnung der Bilder nach Zeitstempel und Screenshots. Nicht gebaut: Kategorien-Filter, Suche (bei 3 Artikeln unnötig). Spätere Ablösung durch Tabelle `articles` + Editor im CRM (G1/G2). Die Artikeltexte enthalten noch den Satz „…Umsatzrechner… Testen Sie ihn gerne aus:“ ohne Link – Adresse fehlt (John liefert).
- 10.10.2026: F1/F2 (Code). SQL: `20261010160000_park_email.sql` (Tabellen `park_email_settings/campaigns/sends/usage`, Spalte `park_entitlements.email_extra_quota`), `20261010160500_park_email_cron.sql` (pg_cron-Takt jede Minute, Geheimnis nur im SQL-Editor einsetzen). Functions (shared): `operator-email-campaigns` (Liste/Entwurf/Einstellungen/Empfänger prüfen/Test an den Betreiber/Senden; Plan- und Kontingentprüfung serverseitig: Starter 2.000, Pro 10.000 + `email_extra_quota`, ohne Plan-Zeile Übergangsregel Starter), `park-email-dispatch` (Header `x-dispatch-secret` = `EMAIL_LINK_SECRET`; je Minute bis 3×100 Mails, Make-Aufruf, Kontingent zählen, bei Make-Fehler bleibt die Mail in der Warteschlange), `park-email-unsubscribe` (HMAC-Link, setzt `marketing_opt_in=false` für die Adresse im Park + `crm_marketing_opt_outs`; Klartext-Bestätigung, weil Supabase kein HTML ausliefert), `park-email-open` (Öffnungspixel, einmal je Mail). Empfänger: nur `photo_claims` mit Einwilligung, je Adresse einmal, ohne Abmeldeliste. Gemeinsamer Code `_shared/emailCommon.ts`; `operatorAuth.ts` bekam `fetchOperatorEmail`. Ein-Datei-Fassungen in `supabase/dashboard-paste/`. UI: `EmailManager.tsx` (Kontingent-Balken mit Upsell ab 80 %, Absender-Einstellungen, Editor mit Blöcken Überschrift/Text/Bild/Button/Trennlinie, Live-Vorschau, Empfänger prüfen, Test-Mail, Senden oder Planen), Reiter „E-Mail“ im Marketing-CRM, Route-Zuordnung `/leads/email` → `email_marketing` (statt `/marketing/email` des Entwurfs). Make-Nutzlast: `{ recipients:[{to,subject,html}], fromName, fromEmail, replyTo }` (wie das CRM, plus `replyTo`). Klicks werden nicht gezählt. Im Plan-Vergleich bleibt „E-Mail“ als „In Entwicklung“ markiert, bis John den Versand live bestätigt.
- 10.10.2026: F0/F1 eingerichtet (Claude selbst, John hat Make-Connector und Supabase-CLI-Login freigegeben). Make: Szenario „Park-E-Mails (Liftpictures)“ (ID 9950437, aktiv, Ordner Liftpictures, Webhook 4428097; Webhook → Iterator → SMTP-Verbindung „Liftpictures Newsletter“ newsletter@liftpictures-fotosysteme.de, Antwort-Adresse aus `replyTo`, sonst Absender). Supabase (geteilt): Secrets `MAKE_PARK_EMAIL_WEBHOOK_URL`, `PARK_EMAIL_FROM_ADDRESS` (= newsletter@liftpictures-fotosysteme.de), `EMAIL_LINK_SECRET` (zufällig, später einmal neu erzeugt, noch keine Mail verschickt); SQL `20261010160000_park_email.sql` ausgeführt (Tabellen + `email_extra_quota` geprüft); Takt `park-email-dispatch` als pg_cron-Job jede Minute (Geheimnis nur in der Job-Definition in der Datenbank, nicht im Repo; Lauf geprüft: 200, `handed_over: 0`); Functions `operator-email-campaigns`, `park-email-dispatch`, `park-email-unsubscribe`, `park-email-open` per CLI deployt (JWT aus). Supabase-CLI auf 2.120 aktualisiert (`supabase db query --linked --project-ref …` führt SQL aus). Regel geändert: Claude führt SQL/Secrets/Deploys jetzt selbst aus (Notiz in den Memory-Dateien). Offen: erste Test-Mail an John, Absender-Einstellungen im Dashboard eintragen, Make-Tarif (Vorgänge) abgleichen, H3-Functions (6) noch nicht redeployt.
- 10.10.2026: H3 serverseitig live. Die Live-Fassungen der fünf Functions im geteilten Projekt wurden vorher heruntergeladen und mit dem Repo verglichen (nur die Seitenliste im `requireOperatorForPark`-Aufruf unterschied sich), dann deployt: `operator-machine-revenue`, `operator-kiosk-purchases`, `operator-survey`, `operator-shop-settings`, `operator-social-campaigns` (alle JWT aus, Test ohne Anmeldung: 401). NICHT deployt: `external-leads` (das Dashboard ruft es im Betreiber-Projekt auf; dort liegt eine andere Fassung, Live-Stand unklar) und die Funktionen für Zeitplan/Benachrichtigungen/Gästeliste. Spalten `allowed_pages/role_label/disabled_at` im Betreiber-Projekt geprüft. Make-Test: Test-Mail über den Webhook an John lief durch (Ausführung erfolgreich, 3 Vorgänge für einen Empfänger; je Mail rechnet das Szenario mit 1 Vorgang plus 2 pro Aufruf, also deutlich weniger als die geschätzten 2 je Mail). Auffällig: im Betreiber-Projekt liegen Kopien der Operator-Functions (v. 14:05 heute, JWT an) – wer sie dort deployt hat, ist nicht geklärt; das Dashboard nutzt die im geteilten Projekt.
