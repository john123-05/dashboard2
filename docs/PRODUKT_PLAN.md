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
| Social-Tool: Beiträge planen, Kampagnen, Auswertung | **auf uns zugeschnitten**: Foto-Teilen-Kampagnen, Gewinnspiele, Prüfung über Instagram |
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
| Preis | 0 € (im Automaten-Service enthalten) | **49 €/Monat** (= heutiger CRM-Preis) | **149 €/Monat** (Vorschlag) |
| Übersicht, Umsatz, Käufe, Fotos, Systemzustand, Kamera, Personalisierung/Overlays, Support, Ratgeber, Benachrichtigungen | ✓ | ✓ | ✓ |
| Mitarbeiter-Zugänge | 3, feste Rollen | 10, Rollen-Vorlagen | unbegrenzt, Rechte je Seite |
| Digitales Foto gegen Kontakt (Freischaltung), Kontakte, CSV-Export | – | ✓ | ✓ |
| Umfrage + NPS-Auswertung | – | ✓ | ✓ inkl. Bewertungs-Weiterleitung (Google) |
| Werbe-Pixel (Meta/Google) | – | ✓ | ✓ |
| E-Mail-Marketing (Monatskontingent) | – | 2.000 E-Mails | 10.000 E-Mails, mehrsprachig, Automationen |
| Social-Media-Kampagnen & Gewinnspiele | – | Teilen-Freischaltung (Selbstmeldung) | Kampagnen, Gewinnspiel-Ziehung, Instagram-Prüfung |
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

Legende Modell: **S** = Sonnet/Codex medium reicht · **O** = Opus empfohlen (Architektur/Datenmodell).

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
  - Migration (shared, `supabase/migrations/2026101012…_park_entitlements.sql`):
    `park_id uuid references parks, plan text check in (...), features text[] default '{}',
    status text check in ('active','trial','paused','cancelled'), trial_until date, source text
    check in ('manual','stripe'), stripe_subscription_id text, updated_at timestamptz, primary key(park_id)`.
    RLS an; Lesen nur über Edge Function.
  - Edge Function `operator-entitlements` (GET, Muster `operator-survey`: verify_jwt=false + eigene
    Park-Prüfung), Staff schreibt über `admin-park-entitlements` (Muster `admin-park-equipment`).
  - `useEntitlements()` liest daraus; fehlt eine Zeile → Übergangsregel aus B1.
  - SQL an John übergeben (pbcopy + Link), nicht ausführen.
- [ ] **B3 Kennzeichnung in Navigation und Seiten** (S) – Voraussetzung B1.
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
- [ ] **C2 Startseite Marketing-CRM** (O für Aufbau, S für Umsetzung)
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
- [ ] **D3 Bewertungs-Weiterleitung (Pro)** (O) – nach NPS ≥ 9 zeigt die Abholseite „Bewerte uns auf
  Google“ (Link aus Einstellungen). Feld `review_url` existiert schon (`review_*` in
  `park_survey_settings`) → prüfen und nutzen; Claim-Seite im Repo `imst`.

### Phase E – Social-Media-Kampagnen (auf Fotos zugeschnitten)

- [ ] **E1 Kampagnen statt Einzelfeld** (O) – Datenmodell `park_social_campaigns` (shared): `id, park_id,
  name, type ('share_unlock'|'giveaway'|'record'), hashtag, mention, prize, starts_at, ends_at,
  status, rules_text, created_at`; `park_social_entries.campaign_id` hinzufügen.
  Kampagnentypen: **Teilen & freischalten** (heute), **Gewinnspiel** (Teilnahme = Teilen mit Hashtag,
  Ziehung im Dashboard, Teilnahmebedingungen-Vorlage), **Rekord-Challenge** (mit Speedmessung: „Schlag
  den Tagesrekord, teile dein Foto“).
- [ ] **E2 Kampagnen-Seite** (S) – Liste der Kampagnen (Status-Chips), „Neue Kampagne“ als
  3-Schritt-Assistent (Typ → Details → Vorschau Abholseite), Detailseite mit Teilnehmern, Filter
  „geprüft/ungeprüft“, Ziehung („Gewinner ziehen“ → zufällig aus geprüften, protokolliert).
- [ ] **E3 Prüfung über Instagram (Pro)** (O, später) – Park verbindet sein Instagram-Business-Konto
  (Meta App, Graph API). Abruf `/{ig-user-id}/tags` (Beiträge, in denen der Park markiert ist) und
  Hashtag-Suche → Abgleich mit Teilnehmer-Benutzernamen → Eintrag „geprüft“. Hinweis für John: Meta
  App Review nötig, dauert Wochen; bis dahin manuelle Prüfung (Link öffnen, Haken setzen).

### Phase F – E-Mail-Marketing

- [ ] **F0 Entscheidung John** – Versanddienst: Vorschlag **Brevo** (EU, günstig, DSGVO) oder Resend.
  „Make“ nur für Automationen, nicht für Massenversand. Absender-Domain je Park (SPF/DKIM).
- [ ] **F1 Datenmodell + Versand** (O) – Tabellen `email_campaigns` (id, park_id, subject, preheader,
  body_json, language, segment_json, status draft/scheduled/sent, scheduled_at, sent_count,
  open_count, click_count), `email_usage` (park_id, month, sent). Edge Function
  `operator-email-campaigns` (CRUD, Testversand, Versand in Stapeln, Kontingent prüfen),
  Abmeldelink Pflicht (`unsubscribe`-Function, `photo_claims.marketing_opt_in` → false).
  Nur an Kontakte mit Opt-in!
- [ ] **F2 Editor** (S) – Seite `/marketing/email`: Liste (Entwurf/Geplant/Gesendet, Öffnungsrate) ·
  Editor mit Blöcken (Überschrift, Text, Bild, Button, Foto-des-Gastes-Platzhalter) · Sprache wählen
  (je Sprache eigene Fassung, Versand an Kontakte mit dieser Sprache) · Kontingent-Anzeige
  („1.240 von 2.000 E-Mails diesen Monat“) mit Upsell bei 80 %.
- [ ] **F3 Automationen (Pro)** (O) – Willkommens-Mail nach Freischaltung, „Saisonstart“-Mail an alle
  Opt-ins, „Dein Foto wartet noch“ (Erinnerung Online-Shop).

### Phase G – Ratgeber (Artikel)

- [ ] **G1 Datenmodell** (O) – Tabelle `articles` (shared): `id, slug unique, title, excerpt,
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

- [ ] **H1 Datenmodell** (O) – Spalte `organization_memberships.allowed_pages text[]` (null = Standard der
  Rolle). Rollen-Vorlagen im Code (`src/lib/permissions.ts`): **Betriebsleitung** (alles außer
  Mitarbeiter/Einstellungen), **Buchhaltung** (Übersicht, Umsatz, Käufe), **Marketing**
  (Marketing-CRM, Fotos, Personalisierung, Ratgeber), **Technik** (Systemzustand, Kamera, Fotos,
  Personalisierung, Support), **Kasse/Team** (Fotos, Systemzustand). `manage-staff` erweitern:
  `create` mit Rolle + Seiten, `update_permissions`, `deactivate`.
- [ ] **H2 Seite Mitarbeiter neu** (S) – Tabelle (Name, E-Mail, Rolle, Seiten, zuletzt aktiv,
  Status) · „Mitarbeiter hinzufügen“ als Schublade: Name, E-Mail, Passwort, Rolle (Vorlagen als Karten)
  → darunter Häkchen-Matrix aller Seiten (vorbelegt aus Vorlage, änderbar) · Bearbeiten/Deaktivieren.
- [ ] **H3 Durchsetzen** (S) – `Sidebar.tsx` filtert nach `allowed_pages`; neuer `PageGuard` in
  `App.tsx` statt nur `OwnerOnly`; Edge Functions für Umsatz/Käufe prüfen Rolle serverseitig (O).

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

- [ ] **S1 Stripe Billing** (O) – Produkte/Preise je Plan + Add-on, Checkout-Session aus `/plaene`,
  Kundenportal-Link im Profilmenü, Webhook → `park_entitlements` (`source='stripe'`).
- [ ] **S2 Staff-CRM: Kunden-Freischaltungen** (S) – im Staff-Dashboard „Kunden Management“ ein Reiter
  „Plan & Add-ons“: Plan setzen, Testzeitraum, Pausieren, Verlauf.

## 7. Offene Entscheidungen für John

1. Preise Marketing Pro (Vorschlag 149 €/Monat) und Zusatz-E-Mails (19 € / 10.000).
2. Bleibt CRM für bestehende Kunden ohne Aufpreis (Übergang „Starter“ für alle, die es heute nutzen)?
3. E-Mail-Versanddienst (Brevo/Resend) und Absenderdomain je Park.
4. Instagram-Prüfung angehen (Meta App Review) oder vorerst manuell?
5. Wer schreibt Ratgeber-Artikel, in welchen Sprachen?

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
