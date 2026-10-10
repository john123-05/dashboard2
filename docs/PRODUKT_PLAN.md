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
- [ ] **B2 Tabelle `park_entitlements`** (O) – Voraussetzung B1.
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
- [ ] **B4 Seite „Pläne“ `/plaene`** (S) – Voraussetzung B1.
  - Datei `src/pages/Plans.tsx`, Route in `App.tsx`, Link im Profilmenü und in Upgrade-Seiten.
  - Aufbau: `UpgradePageHeader` → drei `PlanCard` (Basis/Starter/Pro, Pro hervorgehoben) → darunter
    Vergleichstabelle (Zeilen aus Abschnitt 3.1, Häkchen-Icons) → Add-ons als kleine Karten
    (Links auf bestehende Produktseiten `/configuration/produkt/:id`) → Einstiegsangebot als Hinweisbox.
  - „Anfragen“ ruft `meldeAusstattungsInteresse(parkId, { label: 'Plan anfragen: …' })` (wie
    `CrmPricing.tsx`). Preise als Konstanten oben in der Datei, Kommentar „von John bestätigen“.

### Phase C – Marketing-CRM

- [ ] **C1 Navigation „Marketing-CRM“ mit Unterseiten** (S)
  - `crmTabs.ts`: Reihenfolge Start · Kontakte · E-Mail-Marketing · Social-Media-Kampagnen · Umfrage ·
    Werbe-Pixel. (E-Mail erst sichtbar, wenn F1 fertig.) „Übersicht“-Reiter heißt „Start“.
- [ ] **C2 Startseite Marketing-CRM** (S – Entwurf in 6a)
  - Datei: `Leads.tsx` Ansicht `overview` neu (Logik bleibt, Darstellung neu), am besten eigene
    Komponente `src/components/marketing/MarketingHome.tsx`.
  - Aufbau von oben: Kopf „Marketing-CRM“ + Plan-Abzeichen · **Einrichtungsassistent** (HubSpot
    „Setup guide“: 5 Schritte mit Haken – Freischaltung wählen, Kontaktfelder festlegen, Umfrage
    anlegen, Pixel eintragen, erste E-Mail senden; Fortschrittsbalken; einklappbar, Zustand in
    localStorage) · **Kennzahlen-Zeile** (neue Kontakte 30 Tage, Opt-in-Quote, NPS, E-Mail-Öffnungsrate
    sobald F vorhanden) · **Trichter** (verkaufte Fotos → Freischaltungen → Kontakte → Opt-ins →
    Newsletter geöffnet; horizontale Balken mit Prozent) · **Aktive Freischaltung** (heutige „Gerade
    aktiv“-Karte) · **Live-Vorschau** rechts (vorhanden) · Weltkarte nur auf Klick laden (C4).
- [ ] **C3 Kontakte** (S): Tabelle mit Segment-Filtern (Sprache, Land, Opt-in, Quelle E-Mail/Umfrage/Social,
  Zeitraum), Spaltenauswahl, Mehrfachauswahl → „Zu Segment hinzufügen“ / „Löschen“ / „Exportieren“.
  Kontakt-Schublade (rechts, wie NotificationsDrawer) mit Foto, Freischaltdatum, Umfrage-Antworten,
  E-Mail-Verlauf.
- [ ] **C4 Leistung CRM-Übersicht** (S): Weltkarte erst nach Klick „Karte anzeigen“ rendern
  (`React.lazy`), Kontaktliste paginiert/virtuell (nur sichtbare Zeilen), schwere Berechnungen in
  `useMemo`. Fertig, wenn Imst-CRM in < 1 s bedienbar.

### Phase D – Umfrage neu

- [ ] **D1 Auswertung** (S) – Datei `SurveyResultsView.tsx` neu gestalten:
  NPS-Kachel groß (Wert, Promoter/Passive/Kritiker als gestapelter Balken) · NPS-Verlauf je Woche
  (recharts Linie) · Antwortquote (Antworten ÷ Freischaltungen) · je Frage eine Karte: Skala →
  Balkendiagramm 0–10, Auswahl → horizontale Balken, Freitext → Liste mit Suche + Filter nach Wert ·
  Filterleiste oben: Zeitraum, Sprache, Land · Export CSV.
- [ ] **D2 Fragen-Editor** (S) – `SurveyManager.tsx`: Vorlagen (NPS, Zufriedenheit 1–5, „Wie hast du
  von uns erfahren?“, „Was können wir besser machen?“), Fragetypen-Auswahl als Karten, Reihenfolge per
  Drag & Drop (Muster Ebenen-Liste `OverlayBuilder.tsx`), Vorschau rechts.
- [ ] **D3 Bewertungs-Weiterleitung (Pro)** (S – Entwurf in 6a, entschieden: Pro) – nach NPS ≥ 9 zeigt die Abholseite „Bewerte uns auf
  Google“ (Link aus Einstellungen). Feld `review_url` existiert schon (`review_*` in
  `park_survey_settings`) → prüfen und nutzen; Claim-Seite im Repo `imst`.

### Phase E – Social-Media-Kampagnen (auf Fotos zugeschnitten)

- [ ] **E1 Kampagnen statt Einzelfeld** (S – Entwurf in 6a) – Datenmodell `park_social_campaigns` (shared): `id, park_id,
  name, type ('share_unlock'|'giveaway'|'record'), hashtag, mention, prize, starts_at, ends_at,
  status, rules_text, created_at`; `park_social_entries.campaign_id` hinzufügen.
  Kampagnentypen: **Teilen & freischalten** (heute), **Gewinnspiel** (Teilnahme = Teilen mit Hashtag,
  Ziehung im Dashboard, Teilnahmebedingungen-Vorlage), **Rekord-Challenge** (mit Speedmessung: „Schlag
  den Tagesrekord, teile dein Foto“).
- [ ] **E2 Kampagnen-Seite** (S) – Liste der Kampagnen (Status-Chips), „Neue Kampagne“ als
  3-Schritt-Assistent (Typ → Details → Vorschau Abholseite), Detailseite mit Teilnehmern, Filter
  „geprüft/ungeprüft“, Ziehung („Gewinner ziehen“ → zufällig aus geprüften, protokolliert).
- [ ] **E3 Teilen-Link mit Zähler + Moderation (Pro)** (S – Entwurf in 6a, „E3“) – persönlicher Link
  je Gast mit Besucherzähler und Vorschaubild (Open Graph), Rechte-Häkchen, Moderationsgalerie,
  Rangliste „meiste Freunde“. Instagram-Abgleich ist gestrichen. Voraussetzung E1/E2. Teil der
  Änderungen liegt im Repo `imst` (Claim-Seiten: Link anzeigen + Häkchen).

### Phase F – E-Mail-Marketing

- [ ] **F0 Make-Szenario (John)** – Szenario „Park-E-Mails (Liftpictures)“ in Make anlegen (Webhook →
  Iterator über `recipients` → SMTP) und Secrets setzen, Beschreibung siehe 6a „F1“. Entschieden:
  Versand über Make wie im Liftpictures-CRM, kein Brevo/Resend. Offen: Vorgänge im Make-Tarif.
- [ ] **F1 Tabellen, Make-Versand, Abmeldung, Öffnungszähler** (S – Entwurf in 6a; Voraussetzung F0).
  **Namen mit `park_`**, weil `email_campaigns`/`email_sends` im shared-Projekt dem Liftpictures-CRM gehören.
  Nur an Kontakte mit Einwilligung, `crm_marketing_opt_outs` beachten.
- [ ] **F2 Editor** (S) – Seite `/marketing/email`: Liste (Entwurf/Geplant/Gesendet, Öffnungsrate) ·
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
- [ ] **G2 Editor im Staff-Dashboard** (S) – neue Seite `/staff/ratgeber` (Staff-Stil, `src/staff`):
  Liste, Editor (Titel, Kategorie, Sprache, Titelbild, Markdown mit Vorschau), Veröffentlichen.
  (John hat das Staff-Dashboard hierfür freigegeben, sonst nicht anfassen.)
- [ ] **G3 Ratgeber im Betreiber-Dashboard** (S) – `/ratgeber` (Kartenraster, Kategorien-Filter),
  `/ratgeber/:slug` (Lesansicht, max. 720 px Textbreite, Titelbild, „Weitere Artikel“).
  Übersicht: Karte „Tipps für deinen Park“ (3 neueste). Hilfe-Center: Suche findet auch Artikel.

### Phase H – Mitarbeiter & Rechte

- [ ] **H1 Datenmodell** (S – Entwurf in 6a) – Spalte `organization_memberships.allowed_pages text[]` (null = Standard der
  Rolle). Rollen-Vorlagen im Code (`src/lib/permissions.ts`): **Betriebsleitung** (alles außer
  Mitarbeiter/Einstellungen), **Buchhaltung** (Übersicht, Umsatz, Käufe), **Marketing**
  (Marketing-CRM, Fotos, Personalisierung, Ratgeber), **Technik** (Systemzustand, Kamera, Fotos,
  Personalisierung, Support), **Kasse/Team** (Fotos, Systemzustand). `manage-staff` erweitern:
  `create` mit Rolle + Seiten, `update_permissions`, `deactivate`.
- [ ] **H2 Seite Mitarbeiter neu** (S) – Tabelle (Name, E-Mail, Rolle, Seiten, zuletzt aktiv,
  Status) · „Mitarbeiter hinzufügen“ als Schublade: Name, E-Mail, Passwort, Rolle (Vorlagen als Karten)
  → darunter Häkchen-Matrix aller Seiten (vorbelegt aus Vorlage, änderbar) · Bearbeiten/Deaktivieren.
- [ ] **H3 Durchsetzen** (S) – `Sidebar.tsx` filtert nach `allowed_pages`; neuer `PageGuard` in
  `App.tsx` statt nur `OwnerOnly`; Edge Functions prüfen das Recht serverseitig (Entwurf in 6a, „H3 serverseitig“).

### Phase I – Seiten aufwerten

- [ ] **I1 Käufe** (S) – Filterleiste (Zeitraum, Automat, Zahlungsart, Suche Bildnummer/Beleg),
  Tageszusammenfassung als Zwischenzeilen, Detail-Schublade je Kauf (Beleg, Kartenmarke, Abholung),
  Export CSV, Mobile als Karten.
- [ ] **I2 Kamera** (S) – Layout wie Systemzustand: Kopf mit Status je Kamera, großes letztes Foto
  mit Zeitstempel, Testfoto-Button prominent, Einstellungen (an/aus/auto) als Segment-Schalter mit
  Erklärung, Verlauf der letzten Testfotos.
- [ ] **I3 Support** (S) – Ticketliste links (Status-Chips), Gesprächsansicht rechts im Chat-Stil
  (HubSpot Help Desk), „Neues Ticket“: vor dem Absenden passende Hilfe-Artikel vorschlagen
  (`helpContent.ts`), Kategorie + Dringlichkeit, Kontaktkarte (Telefon/E-Mail aus `helpContent.ts`).

### Phase M – Mobil (Smartphone)

- [ ] **M1 Mobile Kopfzeile + Tab-Leiste** (S) – < 901 px: oben schmale Leiste (Parkname, Glocke mit
  Zähler, Hilfe, Profil – dieselben Panels aus `TopBar.tsx`, Schublade dann 100 % breit); unten feste
  Tab-Leiste: Übersicht · Umsatz · Systemzustand · Benachrichtigungen · Mehr (öffnet heutige Seitenleiste).
  Heutigen runden Menü-Knopf ersetzen.
- [ ] **M2 Tabellen & Karten** (S) – `DataTable`: unter 640 px Kartenansicht (Hauptspalte fett, 2–3
  Nebenwerte); Kennzahl-Raster 2-spaltig; Seitenköpfe umbrechen; Overlay-Studio auf dem Handy:
  Werkzeuge als untere Leiste.
- [ ] **M3 Prüfliste** – jede Seite bei 375/390/430 px: kein seitliches Scrollen, Buttons ≥ 40 px hoch,
  Text ≥ 13 px.

### Phase R – Rest aus dem Redesign-Plan (Gestaltung, keine neuen Funktionen)

Herkunft: `docs/REDESIGN_PLAN.md` Phasen 4–9. Dort erledigt: Phase 1–3, Personalisierung, Systemzustand,
Leiste oben rechts. CRM-Gestaltung steckt in Phase C/D, Käufe/Kamera/Support in Phase I, Handy in Phase M.

- [ ] **R1 Übersicht + Umsatz** (S) – `Overview.tsx`, `Revenue.tsx`, `ZahlungsUebersicht.tsx`,
  `AutomatenUebersicht.tsx`, `KPICard.tsx`: KPI-Karten im Stil der Kennzahl (Abschnitt 4), Diagramm-Karten
  mit Kopfzeile, Zeitraum-Schalter als Segment-Schalter. Diagramm-Animationen behalten. Keine Texte ändern.
- [ ] **R2 Einstellungen** (S) – `Settings.tsx`: links Unternavigation (Sprache, Profil, Organisation,
  Bildpreis, Öffnungszeiten, Benachrichtigungen, Stripe), rechts Formulare in Karten, Speichern-Leiste
  unten fixiert. Alle Felder und Funktionen bleiben; Sprungmarke `#benachrichtigungen` muss weiter gehen.
- [ ] **R3 Online-Shop, Speedmessung, Konfiguration, Fotos, Mitarbeiter-Liste, Login** (S) – an die
  Bausteine aus Abschnitt 4 angleichen (Seitenkopf, Karten, Buttons, Chips). Nur Gestaltung.
- [ ] **R4 Feinschliff** (S) – Leerzustände wie `EmptyNotifications`, Skeletons statt Spinner beim
  ersten Laden, EINE `Modal`-Komponente (`src/components/ui/Modal.tsx`) für alle Dialoge, Fokus-Ringe
  sichtbar, Tooltips einheitlich.

### Phase S – Stripe & Liftpictures-CRM (später)

- [ ] **S1 Stripe Billing** (S – Entwurf in 6a) – Produkte/Preise je Plan + Add-on, Checkout-Session aus `/plaene`,
  Kundenportal-Link im Profilmenü, Webhook → `park_entitlements` (`source='stripe'`).
- [ ] **S2 Staff-CRM: Kunden-Freischaltungen** (S) – im Staff-Dashboard „Kunden Management“ ein Reiter
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
