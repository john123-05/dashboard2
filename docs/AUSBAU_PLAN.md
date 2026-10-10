# Ausbau-Plan (Stufe 2): Speedmessung, Online-Shop, Dein Fotosystem, Hinweise, Kamera, Mobil

Stand: 10.10.2026 · Autor: Claude (Opus) mit John · baut auf `docs/PRODUKT_PLAN.md` auf (Stufe 1 ist dort
abgeschlossen bzw. protokolliert). Diese Datei ist der Arbeitsplan für alles, was John am 10.10.2026 abends
bestellt hat. **Ganz unten steht „Hier geht es weiter“** – dort fängt jede neue Sitzung an.

Repos: Dashboard `~/Downloads/Cursor/dashboard2-4` (`john123-05/dashboard2`, Bolt-Publish nötig) ·
Claim-Seiten `~/Downloads/Cursor/imst` (Remote `imstneu`, Bolt-Publish nötig; enthält Imst, Tarzans, Plose,
Grünberg) · Staff-CRM `~/Downloads/Cursor/liftpictures-crm` (Vercel, Push = live).
Supabase: geteilt `kvpcwlcfgmsmarjtwpsx`, Betreiber `xcrxltiiovpoladpaewd`. Claude darf SQL, Secrets und
Function-Deploys selbst über die Supabase-CLI ausführen (Johns Freigabe vom 10.10.2026).

---

## 1. Was John will (in seinen Worten, sortiert)

1. **Speedmessung als richtiges Produkt.** Zurück- und Vorblättern je Tag (runde Pfeil-Knöpfe wie auf der
   Fotos-Seite), Zeiträume heute / Woche / Monat / Allzeit, einstellen, wer als Schnellster gilt.
   Die öffentliche Tagesbesten-Seite komplett neu: läuft auf dem Fernseher von selbst langsam hoch und
   runter, zeigt immer wieder den Tagesschnellsten, hat auf der großen Ansicht einen QR-Code, der die Seite
   auf dem Handy öffnet (dort blättern und Zeiträume wählen). QR-Code abschaltbar. Ein Bereich
   „Bearbeiten“ wie beim Online-Shop (Sprüche ändern, Instagram-Aufruf, Gewinnspiel) und „Auswerten“
   (mit Knopf zum E-Mail-Marketing). Sauberer Zustand, wenn die Speedmessung noch nicht gebucht ist.
2. **Online-Shop aufgeräumter.** Bearbeiten nicht mehr als lange Seite, sondern als eigener Editor
   (aufklappbare Bereiche / Unterseite). Mehr Produkte (Wandbilder usw.), Anordnen, Auswertungen – als
   Plan, sichtbar als „kommt“. Die Shop-Vorschau soll nicht mehr nach „KI-Shop“ aussehen, sondern wie die
   echte Claim-Seite bzw. die Shops der Parks.
3. **Marketing-CRM Start:** detaillierte Karte immer offen; die Live-Vorschau rechts nur so lang wie die
   Seite wirklich ist.
4. **„Konfiguration“ heißt „Dein Fotosystem“.** Oben die Ausstattung, darunter die drei Pläne.
   **Preise & Pakete** wie bei HubSpot: Filter (Marketing, Online-Shop, Speedmessung, Fotosystem), zusätzlich
   Buchbares mit Preisen, unten der Vergleich.
5. **Hinweise (Pop-ups) aus unserem CRM je Kunde:** auf welcher Seite, an welcher Stelle (unten rechts,
   oben links …), mit Text, Knopf und QR-Code; dazu Push-Benachrichtigung aufs Gerät.
6. **Kamera-Seite** komplett überarbeiten (verständlicher, gleiche Funktionen).
7. **Mitarbeiter-Seite** in Gestaltung und Technik verbessern.
8. **Mobil-Plan:** wie alles auf dem Handy angeordnet wird.
9. Alles „im HubSpot-Stil“ und so geplant, dass jemand anderes weiterarbeiten kann.

## 2. Recherche: wie Profi-Werkzeuge das lösen

| Thema | Vorbild | Was wir übernehmen |
|---|---|---|
| Bestenlisten auf dem Bildschirm | Kart-Zeitnahme (Apex Timing, SMS-Timing u. a.): TV-Modul mit Podium, „Fast Lap“-Einblendung, eigenem Branding. Leaderboarded: Anzeige auf TV/Tablet/Handy, Beitritt per QR-Code. | Großer „Tagesschnellste/r“-Block, Top 3 als Podium, automatischer Durchlauf, QR-Code zum Mitnehmen aufs Handy, Park-Farben. Zeiträume heute/Woche/Monat/Allzeit haben die Kart-Systeme nicht einheitlich – wir bauen sie selbst. |
| Preise | HubSpot: Produkte („Hubs“) als Reiter, je Produkt Stufen, Zusatzleistungen als eigene Zeilen mit Preis, unten Vergleichstabelle. | Filter-Reiter oben, Pläne als Karten, „Zusätzlich buchbar“ als Karten mit Preis, Vergleich unten. |
| Shop-Verwaltung | Shopify-Admin: Start · Produkte · Kollektionen · Online-Shop (Theme „Anpassen“ mit Abschnitten links, Vorschau rechts) · Auswertungen · Rabatte. | Shop-Übersicht + eigener Editor (Abschnitte links, Vorschau rechts), Auswertungs-Kacheln, Produkte als Liste mit Schalter und Preis. |
| Hinweise in der App | Appcues/Intercom/Userflow: Banner je Seite gezielt, dauerhaft schließbar, Modal nur für Wichtiges, höchstens eine Meldung zugleich. | Kleine Karte in einer Ecke, je Seite steuerbar, einmal geschlossen = weg, höchstens eine sichtbar, Ansichten/Klicks zählen. |

Quellen: apex-timing.com (Karting-Zeitnahme), leaderboarded.com (QR + TV), help.shopify.com (Admin-Übersicht),
docs.appcues.com (Banner), mehrere HubSpot-Preisübersichten (instant.one, eesel.ai).

## 3. Leitlinien (gelten für alles hier)

- Bausteine aus `PRODUKT_PLAN.md` Abschnitt 4: Seitentitel `text-[28px] font-light`, Karten `GlassCard`,
  Farben `--ink/--ink-2/--ink-3/--line`, Akzent `brand-600`, Segment-Schalter dunkel aktiv, `Modal`,
  `Drawer`, `EmptyState`, `Skeleton`.
- Neue Texte nur über `t('…')` in 7 Sprachen (`scripts/i18n_apply.py`), `npm run check:i18n`.
- Nichts sperren, was heute läuft. Neue Tabellen nur additiv, Functions mit Rückfall, wenn die Tabelle fehlt.
- Öffentliche Seiten (Bestenliste, Shop-Vorschau) folgen dem Aussehen der jeweiligen Park-Seite, nicht dem
  Dashboard: Papier-Hintergrund, schwarze Schrift, kursive Großbuchstaben-Überschriften, kleine Radien,
  Akzentfarbe sparsam.
- Ohne gebuchte Funktion: echte Seite mit Beispieldaten + Angebot, nie eine leere Wand.

---

## 4. Aufgaben

Legende: `[x]` erledigt · `[~]` gebaut, Sichtprüfung/Feinschliff offen · `[ ]` offen.

### Phase SP – Speedmessung

- [~] **SP1 Daten dauerhaft** – Tabelle `park_speed_results` (jede freigeschaltete Fahrt mit km/h, Tag in
  Park-Zeit, ausblendbar), Trigger an `photo_claims`, Nachtrag aus den vorhandenen Fotos. Grund: `photos`
  wird nach ca. 30 Tagen gelöscht, Woche/Monat/Allzeit brauchen eigene Daten. Tabelle `park_speed_settings`.
- [~] **SP2 Öffentliche Schnittstelle `park-leaderboard`** – eine Function für alle Parks: Zeitraum
  (`day`, `week`, `month`, `all`), Datum, liefert Rangliste (beste Fahrt je Gast), Tagesschnellste/n,
  öffentliche Einstellungen. Ersetzt für die neue Seite die drei `*-leaderboard`-Functions (die bleiben).
- [~] **SP3 Betreiber-Schnittstelle `operator-speed`** – Rangliste mit Verwaltung (Fahrt ausblenden),
  Tageswerte, Einstellungen speichern.
- [~] **SP4 Dashboard-Seite Speedmessung** – Tag blättern (runde Pfeile + Datum), Zeitraum-Schalter,
  Kennzahlen des gewählten Tags, Rangliste mit „ausblenden“, „Top 10 als Segment“ + „E-Mail schreiben“,
  aufklappbarer Bereich **Bestenliste bearbeiten** (Texte, Instagram, Gewinnspiel, QR, Durchlauf,
  Höchstwert), Vorschau rechts, registrierte Gäste wie bisher.
- [~] **SP5 Öffentliche Seite neu** (Repo `imst`, eine gemeinsame Komponente für Imst/Tarzans/Plose/
  Grünberg): Tagesschnellste/r groß, Podium, Liste, Zeitraum-Reiter und Tag blättern, automatischer
  Durchlauf auf großen Bildschirmen, QR-Code, Sprüche aus den Einstellungen, Beispieldaten mit `?demo=1`.
- [~] **SP6 Paket-Beschreibung** – in Preise & Pakete und im Angebot: „Bearbeiten & Auswerten“, Gewinnspiel
  für die Tagesbesten, Verbindung zum E-Mail-Marketing.
- [ ] **SP7 (später)** Gewinnspiel-Automatik: Tagessieger automatisch anschreiben (E-Mail-Automation
  `speed_winner`), Urkunde als Bild zum Teilen, Rekord-Benachrichtigung an den Betreiber.

### Phase OS – Online-Shop

- [~] **OS1 Seite aufräumen** – `/shop` = Übersicht (Potenzial, Status, Vorschau, Auswertung);
  **Shop bearbeiten** als eigener Editor `/shop/bearbeiten` mit aufklappbaren Abschnitten links
  (Design · Texte · Produkte & Preise · Anordnung · Zahlungen) und Vorschau rechts.
- [~] **OS2 Shop-Vorschau professioneller** – `DemoShop` in beiden Repos im Stil der Claim-Seiten:
  Kopf wie die Park-Seite, Foto-Raster ohne bunte Fläche, klare Produktzeilen, Vertrauenszeile, fester
  Warenkorb-Balken auf dem Handy, Fußzeile mit Rechtstexten.
- [~] **OS3 Mehr Produkte** – Katalog erweitern (Poster, Leinwand/Wandbild, Fotobuch-Seite, Schlüsselanhänger,
  Puzzle) in `_shared/shopCatalog.ts` + Mockups; Standard „aus“, damit bestehende Shops unverändert bleiben.
- [~] **OS4 Auswertung (Vorschau)** – Kacheln Bestellungen, Umsatz, Kaufquote, beliebtestes Produkt; echte
  Zahlen aus den Test-Käufen, sonst als „kommt mit der Freischaltung“ gekennzeichnet.
- [ ] **OS5 (später)** Anordnung per Ziehen, Kollektionen (z. B. „Erinnerungen“, „Geschenke“), Rabattcodes,
  Versand-/Druckpartner-Anbindung, Bestellverwaltung. Entwurf in Abschnitt 5.

### Phase FS – Dein Fotosystem, Preise & Pakete

- [~] **FS1 Umbenennen** – Navigation „Konfiguration“ → „Dein Fotosystem“ (7 Sprachen).
- [~] **FS2 Seite** – oben „Deine Ausstattung“, darunter „Dein Plan“ (drei Pläne kompakt, aktueller markiert,
  Link zu Preise & Pakete), darunter „Mehr aus deinem Fotosystem“ (bestehende Produktkacheln).
- [~] **FS3 Preise & Pakete `/plaene`** – Filter-Reiter Alle · Marketing · Online-Shop · Speedmessung ·
  Fotosystem; Pläne; „Zusätzlich buchbar“ (Online-Shop, Speedmessung, Zusatz-E-Mails, Hardware) mit Preisen
  und Link zur Detailseite; Vergleichstabelle unten.

### Phase HW – Hinweise aus dem CRM

- [~] **HW1 Datenmodell + Functions** – `park_announcements`, `park_announcement_events`;
  `operator-announcements` (aktive Hinweise für Park/Seite, Ereignisse), `admin-park-announcements`
  (anlegen, ändern, löschen, Push senden).
- [~] **HW2 Dashboard** – `AnnouncementHost` im Layout: Karte in der gewählten Ecke, optional QR-Code und
  Knopf, einmal geschlossen = weg, höchstens eine zugleich.
- [~] **HW3 CRM-Seite „Hinweise“** – Liste, Formular (Kunde oder alle, Seiten, Position, Zeitraum, Text,
  Knopf, QR), Zahlen (gesehen/geklickt/geschlossen), „Als Push senden“.

### Phase KA / MI / CR

- [~] **KA1 Kamera-Seite** – Kopf mit Status, Bild links (klebt), Einstellungen rechts in vier Gruppen
  (Belichtung · Farbe · Kontrast & Dynamik · Schärfe & Rauschen) mit Erklärung zum Aufklappen und
  „Zurücksetzen“ je Regler, feste Änderungsleiste unten, technische Werte eingeklappt.
- [~] **MI1 Mitarbeiter-Seite** – Kopf mit Zähler und Limit, „Mitarbeiter einladen“ als Dialog, Tabelle mit
  Initialen, Rolle, Seiten als Chips, zuletzt aktiv, Status; Aktionen im Zeilenmenü.
- [~] **CR1 Marketing-CRM Start** – Karte immer offen; Live-Vorschau mit fester Höhe, klebt beim Scrollen.

### Phase PK – Pakete, Preise und Aktionen im CRM steuern (Wunsch von John, 10.10.2026)

John will im Liftpictures-CRM (Repo `liftpictures-crm`) alle Pakete und Preise **selbst pflegen**: Beschreibung auf den
Karten ändern, sehen was enthalten und was nicht enthalten ist, Preise ändern, Rabatte je Kunde geben, Aktionen
starten. Heute stehen alle Preise und Texte fest im Dashboard-Code (`Plans.tsx`, `ShopPackages.tsx`,
`SpeedPackages.tsx`, `SoftwarePackages.tsx`, Texte in `i18n.tsx`) – jede Änderung braucht einen Entwickler.

Reihenfolge so gewählt, dass nach jedem Schritt etwas Sichtbares da ist und nichts kaputtgehen kann: das Dashboard
nimmt den Katalog nur, wenn er da ist, sonst die jetzigen festen Werte.

- [~] **PK1 Katalog-Tabellen + Befüllung** – Tabellen `catalog_packages`, `catalog_points`, `catalog_package_points`
  (Entwurf unten). Einmalig befüllt aus den heutigen Werten (Basis 0 €, Starter 49 €, Pro 149 €, Shop drei Wege,
  Speedmessung drei Hardware-Pakete, Software drei Pakete, Zusatzleistungen). Danach zeigt das CRM exakt das,
  was Kunden heute sehen.
- [~] **PK2 CRM-Seite „Pakete & Preise“ (`/pakete`)** – Filter wie im Dashboard (Alle · Marketing · Online-Shop ·
  Speedmessung · Software · Fotosystem). Je Paket eine Karte mit Preis, Laufzeit, Abzeichen, **Enthalten** und
  **Nicht enthalten**; Bearbeiten im Seitenfenster (Name, Kurztext, Preis, Laufzeit, geschenkte Monate, Hervorhebung,
  an/aus, Reihenfolge, Punkte hinzufügen/entfernen/umsortieren, „enthalten“ ja/nein je Punkt). Rechts Vorschau der
  Karte wie im Dashboard. Änderungsverlauf (wer, wann, vorher → nachher). Nur Mitarbeiter mit `admin_users`.
- [~] **PK3 Dashboard liest den Katalog** – Function `operator-catalog` (liefert aktive Pakete, Punkte,
  Aktionen, Kundenpreise). Hook `useCatalog()`; `Plans`, `ShopPackages`, `SpeedPackages`, `SoftwarePackages`,
  `CompareTable` zeichnen aus dem Katalog; fehlt er, gelten die festen Werte. Die Vergleichstabelle wird aus den
  „enthalten“-Häkchen erzeugt, also nie mehr von Hand gepflegt.
- [ ] **PK4 Rabatte je Kunde** – Tabelle `park_price_overrides` (Park, Paket, Rabatt in % oder Festpreis, extra
  geschenkte Monate, Notiz, gültig bis, wer). Im Dashboard sieht der Kunde den alten Preis durchgestrichen und
  „Dein Preis“. Im CRM: auf der Seite **Plan** (pro Kunde) unten der Abschnitt „Preise & Rabatte“.
- [ ] **PK5 Aktionen** – Tabelle `catalog_promotions` (Name, Banner-Text, Rabatt % oder geschenkte Monate, welche
  Pakete, für wen: alle / bestimmter Plan / Liste von Parks, optional Code, von–bis, an/aus). Dashboard: Banner
  oben in „Preise & Pakete“ und Abzeichen auf den Karten. CRM: Zähler gesehen · angefragt · gebucht je Aktion.
- [ ] **PK6 Plan-Seite je Kunde ausbauen** – Beim Runterscrollen weitere Abschnitte: Preise & Rabatte (PK4),
  Aktion zuweisen (PK5), Anfragen dieses Kunden (aus „Plan/Paket anfragen“), Änderungsverlauf, Notizen.
- [ ] **PK7 Anfragen-Eingang** – Alle Anfragen aus dem Dashboard (Plan, Shop, Speedmessung, Software, Zusatz-E-Mails)
  als Liste im CRM mit Knopf „Freischalten“ (setzt Plan/Zusatzfunktionen, legt Angebot an) und Status
  neu · in Arbeit · erledigt.
- [ ] **PK8 (später)** Stripe-Anbindung des Katalogs: aus einem Paket automatisch Stripe-Preis anlegen, Rabatt als
  Stripe-Gutschein, Aktionscode im Checkout.

### Phase MB – Mobil

- [~] **MB1 Plan** – siehe Abschnitt 6. Umsetzung je Seite beim Bau gleich mit (kein eigener Durchgang).

---

## 5. Entwürfe (Datenmodell und Schnittstellen)

### SP – Speedmessung

```sql
create table public.park_speed_results (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  photo_id uuid not null,            -- bewusst ohne Fremdschlüssel: Fotos werden nach ~30 Tagen gelöscht
  claim_id uuid,
  email text not null,               -- klein geschrieben; Name/Bild kommen aus park_guest_profiles
  speed_kmh numeric not null,
  captured_at timestamptz not null,
  day date not null,                 -- Kalendertag in Park-Zeit
  hidden boolean not null default false,  -- vom Betreiber ausgeblendet (Messfehler, Unfug)
  created_at timestamptz not null default now(),
  unique (park_id, photo_id, email)
);
create table public.park_speed_settings (
  park_id uuid primary key references public.parks(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
```
`settings`: `headline`, `subline`, `cta_title`, `cta_text`, `winner_text`, `instagram_handle`, `hashtag`,
`prize_text`, `show_qr` (Standard an), `auto_scroll` (Standard an), `rows` (10), `max_speed_kmh` (leer = keine
Grenze), `periods` (welche Reiter die Gäste sehen).

Trigger `photo_claims_speed_result` (nach Einfügen/Statuswechsel auf `claimed`): schreibt die Fahrt aus
`photos` (nur mit km/h, keine Testfotos) in `park_speed_results`; Fehler werden verschluckt.

`park-leaderboard` (öffentlich): `POST { park_id, period, date? }` →
`{ period, date, from, to, rows: [{ rank, speedKmh, capturedAt, displayName, avatarUrl }], total, champion,
settings, hasData }`. Beste Fahrt je Gast, ohne abgemeldete und ausgeblendete, ohne Werte über `max_speed_kmh`.

`operator-speed` (Betreiber): `GET ?park_id=&period=&date=` → zusätzlich `id`, `email`, `claimId`, `hidden`,
`stats` (Fahrten, schnellste, langsamste, Schnitt des Tages), `settings`.
`POST { action: 'save_settings' | 'hide' | 'unhide' }`.

### HW – Hinweise

```sql
create table public.park_announcements (
  id uuid primary key default gen_random_uuid(),
  park_id uuid references public.parks(id) on delete cascade,   -- null = alle Parks
  title text not null,
  body text not null default '',
  cta_label text, cta_url text, qr_url text,
  position text not null default 'bottom-right'
    check (position in ('bottom-right','bottom-left','top-right','top-left','center')),
  pages text[] not null default '{}',     -- Seiten-Schlüssel wie src/lib/permissions.ts; leer = überall
  audience text not null default 'all' check (audience in ('all','owner','staff')),
  tone text not null default 'info' check (tone in ('info','offer','warning')),
  starts_at timestamptz, ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.park_announcement_events (
  announcement_id uuid not null references public.park_announcements(id) on delete cascade,
  park_id uuid not null, user_id text not null,
  event text not null check (event in ('seen','clicked','dismissed')),
  created_at timestamptz not null default now(),
  primary key (announcement_id, park_id, user_id, event)
);
```
`operator-announcements`: `GET ?park_id=` → aktive Hinweise (ohne die vom Nutzer geschlossenen);
`POST { park_id, announcement_id, event }`.
`admin-park-announcements` (nur `admin_users`): `GET` (Liste + Zähler), `POST save|delete|push`.
Push nutzt `operator_push_subscriptions` + `_shared/webpush.ts`.

### OS – Online-Shop (Ausbau später, damit jemand weiterbauen kann)

- `park_shop_settings.products` bleibt die Quelle (Schlüssel, an/aus, Preis). Neu dazu `sort` (Zahl) je
  Produkt und `collections` (`[{ key, label, product_keys }]`) als JSON in derselben Zeile.
- Bestellungen: Tabelle `park_shop_orders` (Stripe-Sitzung, Positionen, Status `paid|in_production|shipped|
  delivered`, Sendungsnummer) – wird vom Webhook geschrieben, in `/shop/bestellungen` verwaltet.
- Druckpartner: eine Function `shop-fulfilment` je Anbieter (Auftrag übergeben, Status abholen).
- Rabattcodes: Stripe-Gutscheine, im Editor als Liste.
- Live-Schalten je Park: `park_shop_settings.live = true` + Stripe-Live-Schlüssel; bis dahin Testmodus.

### PK – Pakete, Preise, Aktionen (Entwurf)

```sql
catalog_packages(
  -- (gebaut: siehe supabase/migrations/20261011100000_catalog.sql; Texte der Karten stehen in `texts`, die
  --  „Das ist dabei / nicht dabei“-Liste in `bullets`, Sonderwerte in `meta`, Vergleichszeilen mit `kind`)
  key text primary key,                 -- z. B. 'marketing_starter', 'shop_monthly', 'speed_display', 'software_year'
  grp text not null,                    -- 'plan' | 'shop' | 'speed' | 'software' | 'system' | 'addon'
  sort int not null default 0,
  active boolean not null default true,
  highlight boolean not null default false,
  price_cents int,                      -- null = auf Anfrage
  price_unit text,                      -- 'month' | 'once' | 'period'
  term_months int, free_months int default 0, setup_cents int,
  texts jsonb not null default '{}',    -- { de:{name,tagline,badge,price_note}, en:{…}, … } (de Pflicht)
  updated_at timestamptz, updated_by text
)
catalog_points(                         -- ein Punkt = eine Zeile der Vergleichstabelle, gilt für mehrere Pakete
  key text primary key, grp text, sort int, texts jsonb      -- { de:'…', en:'…' }
)
catalog_package_points(package_key text, point_key text, included boolean, note jsonb,
  primary key (package_key, point_key))
catalog_history(id, package_key, changed_by, changed_at, before jsonb, after jsonb)
park_price_overrides(park_id uuid, package_key text, discount_percent int, fixed_price_cents int,
  extra_free_months int, note text, valid_until date, created_by text, created_at timestamptz)
catalog_promotions(id, name, banner jsonb, discount_percent int, free_months int, package_keys text[],
  audience jsonb,                       -- { all:true } | { plans:[…] } | { park_ids:[…] }
  code text, starts_on date, ends_on date, active boolean)
catalog_promotion_events(promotion_id, park_id, event text, at timestamptz)   -- seen | requested | booked
```

Funktionen (shared-Projekt): `admin-catalog` (nur `admin_users`: lesen/speichern/Verlauf), `operator-catalog`
(`GET ?park_id=` → aktive Pakete mit Punkten, gültiger Aktion und Kundenpreis; `POST` Ereignis für Zähler).

Regeln:
1. **Rückfall:** Ist der Katalog leer oder die Function nicht erreichbar, nutzt das Dashboard die festen Werte aus dem
   Code. Nie eine leere Preisseite.
2. **Sprachen:** Deutsch ist Pflicht und Quelle. Andere Sprachen sind optional; fehlt eine, zeigt das Dashboard den
   bisherigen übersetzten Text (solange das Paket unverändert ist) sonst den deutschen. Im CRM je Feld ein Reiter
   „Übersetzungen“ (später: Vorschlag per Knopf).
3. **Preisrang:** Kundenpreis (Override) vor Aktion vor Listenpreis. Es gilt der günstigere nur, wenn John es so
   einstellt – Standard: Kundenpreis überschreibt alles.
4. **Nichts Laufendes ändern:** Bestehende Abos (Stripe) behalten ihren Preis; Änderungen im Katalog wirken auf neue
   Anfragen. Das wird im CRM beim Speichern angezeigt.
5. **Rechte:** Katalog ändern dürfen nur Mitarbeiter in `admin_users`; Änderungen werden immer im Verlauf festgehalten.

## 6. Mobil-Plan (Handy, 360–430 px)

Grundsätze (gelten für jede Seite, alt wie neu):
1. **Rahmen:** schmale Leiste oben (Park, Hilfe, Glocke, Profil), feste Leiste unten mit 5 Zielen
   (Übersicht · Umsatz · Systemzustand · Benachrichtigungen · Mehr). Steht seit Stufe 1.
2. **Eine Spalte.** Rechte Spalten (Vorschau, Details) rutschen unter den Inhalt; Vorschauen bekommen einen
   Knopf „Vorschau“ statt eines dauerhaft sichtbaren Rahmens, wenn sie höher als der Bildschirm wären.
3. **Kopf:** Titel, darunter höchstens zwei Knöpfe; weitere Aktionen in ein „…“-Menü.
4. **Filter:** als waagerecht scrollbare Chips; Datum blättern mit zwei runden Pfeilen links/rechts vom Datum.
5. **Tabellen** als Karten (steht), Zwischenzeilen als graue Überschrift.
6. **Formulare:** Felder untereinander, Speichern als feste Leiste über der unteren Navigation.
7. **Schubladen und Dialoge** in voller Breite von unten.
8. **Tippflächen** mindestens 40 px, Eingaben 16 px Schrift (kein Zoom am iPhone).

Je Seite:
| Seite | Anordnung auf dem Handy |
|---|---|
| Speedmessung | Datum-Blättern → Zeitraum-Chips → 2×2 Kennzahlen → Rangliste → „Bearbeiten“ eingeklappt → Gäste; Vorschau als Knopf „Öffentliche Seite ansehen“. |
| Öffentliche Bestenliste | Tagesschnellste/r oben, Zeitraum-Chips kleben unter dem Kopf, Liste, Aufruf-Karte am Ende; kein Durchlauf, kein QR-Code. |
| Online-Shop | Status → Kennzahlen untereinander → „Shop bearbeiten“ → Vorschau; im Editor Abschnitte als Akkordeon, Vorschau über einen Umschalter „Bearbeiten / Vorschau“. |
| Dein Fotosystem | Ausstattung als Liste → Plan-Karte → Produkte einspaltig. |
| Preise & Pakete | Filter-Chips, Pläne untereinander (aktueller zuerst), Zusatzleistungen untereinander, Vergleich waagerecht scrollbar mit fester erster Spalte. |
| Kamera | Bild oben (klebt nicht), Gruppen als Akkordeon, Änderungsleiste fest über der Navigation. |
| Mitarbeiter | Karten je Person, Aktionen im „…“-Menü, Einladen als Dialog von unten. |
| Marketing-CRM | Reiter als scrollbare Chips, Vorschau ganz unten. |
| Hinweise | unten: volle Breite über der Navigation; oben: unter der oberen Leiste; Mitte: Dialog. |

## 7. Annahmen (von Claude getroffen, weil John nicht gefragt werden wollte)

1. „Einstellen, wer der Schnellste ist“ = Zeitraum wählen UND einzelne Fahrten ausblenden bzw. einen
   Höchstwert setzen (gegen Messfehler). Ein von Hand gesetzter Sieger ist nicht vorgesehen.
2. Ranglisten zeigen die **beste Fahrt je Gast** (vorher: jede Fahrt einzeln).
3. „Webbilder“ = Wandbilder (Poster, Leinwand).
4. Hinweise sieht, wer die Seite sehen darf; Zielgruppe wählbar (alle / nur Inhaber / nur Mitarbeiter).
5. Neue Shop-Produkte sind standardmäßig aus.
6. Öffentliche Seiten bleiben auf Deutsch (wie bisher); Sprüche sind freie Texte des Betreibers.

## 8. Protokoll

11.10.2026, Claude (Sonnet 5.5) – PK1–PK3 gebaut, `[~]` bis John es gesehen hat:
- PK1: Migration `20261011100000_catalog.sql` (erzeugt von `scripts/catalog_seed.py`, nochmal ausführen ändert nichts am Bearbeiteten).
  16 Pakete, 59 Vergleichszeilen, alle 7 Sprachen aus `i18n.tsx`. Functions `admin-catalog` (Staff) und `operator-catalog` live.
- PK2: CRM `/pakete` (Repo liftpictures-crm, `PackagesPage.tsx`): Pakete bearbeiten, Vergleichszeilen, Verlauf. Neue **Pakete** anlegen ist
  bewusst nicht dabei – das Dashboard zeigt nur bekannte Pakete; neue Vergleichszeilen gehen.
- PK3: Dashboard liest den Katalog (`src/lib/catalog.ts`, `useCatalog`), mit Rückfall auf die eingebauten Werte. Geändert: `Plans`, `ShopPackages`,
  `SpeedPackages`, `SoftwarePackages`, `PackageCompare`, `CompareTable`, `PlanCard` (zeigt Nicht-Enthaltenes durchgestrichen).
- Regel beim Speichern: Ändert sich der deutsche Text und die Übersetzung wurde nicht angefasst, wird die alte Übersetzung gelöscht (zeigt dann Deutsch).
- Nächster Schritt: PK4 (Rabatte je Kunde), dann PK5 (Aktionen).

10.10.2026, Claude (Opus 5.5 / Sonnet 5.5), alles lokal geprüft mit tsc, check:i18n, build – **Sichtprüfung durch John steht aus** (Chrome-Erweiterung getrennt), deshalb `[~]`:

- SP1–SP3: Migration `20261010230000_park_speed`, Functions `park-leaderboard`, `operator-speed` live (shared-Projekt).
- SP4: `src/pages/Users.tsx` + `src/lib/speed.ts` (Zeitraum, Blättern, Rangliste verwalten, Bearbeiten-Bereich, Segment).
- SP5: Repo `imst`, `src/shared/Leaderboard.tsx` (eine Seite für alle Parks, TV-Durchlauf, QR, `?demo=1`); Bolt-Veröffentlichung nötig.
- SP6: Beschreibung in Preise & Pakete (`pp.addon_speed_text`) und im Angebot (`speed.offer.*`).
- OS1/OS4: `src/pages/Shop.tsx` (Übersicht) + Route `/shop/bearbeiten` (Editor mit Abschnitten, feste Speichern-Leiste, Handy/Desktop-Vorschau); Auswertung zeigt echte Test-Zahlen, Kaufquote/Top-Produkt als „kommt später“.
- OS2: `DemoShop` im Stil der Claim-Seiten, in beiden Repos (dashboard `src/pages/DemoShop.tsx`, imst `src/demo-shop/DemoShop.tsx`).
- OS3: Poster, Leinwand, Schlüsselanhänger, Puzzle in `_shared/shopCatalog.ts` (Standard aus) + Mockups; Functions neu deployt.
- FS1–FS3: „Dein Fotosystem“, Plan-Streifen, Preise & Pakete mit Filter, Zusatzleistungen, Vergleich.
- HW1–HW3: Tabellen + Functions `operator-announcements`, `admin-park-announcements`; `AnnouncementHost` im Dashboard; CRM-Seite „Hinweise & Push“ (Repo `liftpictures-crm`).
- KA1: `src/pages/Kamera.tsx` neu (vier Gruppen, Original/Vorschau, Änderungsleiste, Dialoge). Alle Funktionen unverändert.
- MI1: `src/pages/Team.tsx` neu (Zähler, Einladen-Dialog, Tabelle, Zeilenmenü).
- CR1: Karte immer offen (lädt beim Hinscrollen), Vorschau mit fester Höhe.
- MB1: je Seite gleich mitgebaut (Tabellen werden zu Karten, feste Leisten über der Tab-Leiste); keine eigene Runde.

Noch offen: SP7 und OS5 (bewusst später), Sichtprüfung aller `[~]`.

---

## 9. HIER GEHT ES WEITER

```text
Du arbeitest am Liftpictures-Betreiber-Dashboard. Lies zuerst CLAUDE.md, dann docs/PRODUKT_PLAN.md
(Abschnitt 0 und 4) und diese Datei (docs/AUSBAU_PLAN.md).
1. Nimm die erste Aufgabe in Abschnitt 4 mit [ ] (oder [~], wenn nur die Sichtprüfung fehlt und John
   Rückmeldung gegeben hat). Entwurf dazu steht in Abschnitt 5.
2. Baue nur diese Aufgabe. Texte über t('…') in 7 Sprachen, danach npm run check:i18n,
   npx tsc --noEmit -p tsconfig.app.json, npm run build.
3. SQL/Functions darfst du selbst einspielen (Supabase-CLI ist angemeldet):
   supabase db query --linked --project-ref <ref> -f <datei.sql>
   supabase functions deploy <name> --project-ref <ref> --no-verify-jwt --use-api
   Vor dem Überschreiben einer bestehenden Function: herunterladen und mit dem Repo vergleichen.
4. Setze das Häkchen, schreibe eine Zeile ins Protokoll (Abschnitt 8), committe und pushe.
5. Sag John auf Deutsch und ohne Fachwörter, was fertig ist, was er in Bolt veröffentlichen muss und was er
   ansehen soll. Claude kann die Seiten nicht selbst sehen, solange die Chrome-Erweiterung getrennt ist.
```
