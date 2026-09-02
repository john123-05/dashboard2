# dashboard2 - Agent Context

Read this first. It carries the full working context so a fresh session
can continue where the last one stopped. Last updated 2026-09-02.

**The master map of the whole Liftpictures ecosystem (all repos, both
Supabase projects, customers, photo pipeline, incident history) lives in
`john123-05/testsoftware` -> `docs/ECOSYSTEM.md`. Read that too.**

## What this repo is

Two apps in one Vite+React+TS codebase, live at
**dashboard-liftpictures.com**, GitHub `john123-05/dashboard2`:

- **Operator Dashboard** (`src/pages/*`, `src/components/*`) - customer
  facing, one park per login. Auth: `park_access` table +
  `verify_park_access` RPC on the operator Supabase project. Tailwind
  styling with glass-panel design (`src/index.css`, `KPICard`,
  `GlassCard`).
- **Staff Dashboard** (`src/staff/*`, routes `/staff/*`) - internal
  admin tool. Auth: `admin_users` table on the shared project
  (`AdminLayout.tsx`). Styling: custom CSS classes in
  `src/staff/styles.css`, all scoped under `.staff-app`, with light/dark
  theme via CSS variables (Tailwind works here too but is not the house
  style).

Deploy: **Netlify auto-deploys from `main`** - a plain `git push` goes
live. (Unlike the `imst` claim-page repo, which has a bolt.new publish
gate where pushing alone does NOT deploy.)

## The two Supabase projects (never confuse them)

- **`kvpcwlcfgmsmarjtwpsx` (shared/content)**: parks, photos,
  photo_claims, attractions, park_cameras, park_path_prefixes,
  admin_users, support_tickets(+messages), cost_items, staff_credentials,
  staff_notifications, staff_checklist_items, staff_handoff_notes,
  park_photo_sales_daily (permanent revenue rollup; raw photos rows are
  hard-deleted after ~30d), park_photo_ride_daily, park_inactivity_alerts,
  liftpic_machine_configs, liftpic_asset_deployments, machine_status,
  photo_events, machine_sale_payments (permanent per-purchase card/cash
  attribution, see below). Client: `supabaseBrowser` from
  `src/staff/lib/supabase.ts`.
  Edge functions here: all `admin-*` (pattern:
  `_shared/sameProjectAdminAuth.ts`), `dispatch-lead-push`, `liftpic-*`.
- **`xcrxltiiovpoladpaewd` (operator)**: park_access, media_assets,
  stripe_product_selections, park-dashboard-data, stripe-revenue,
  kiosk-photo-sales, admin-set-park-password (pattern:
  `_shared/staffAuth.ts` - verifies staff via shared project using a
  `staffAccessToken` in the body). Clients: `supabase` +
  `externalSupabase` from `src/lib/supabase.ts`.

`edgeFetch` (`src/staff/lib/edge-fetch.ts`) maps `/api/admin/...` routes
to shared-project edge functions. Historical trap: several routes in
that map referenced functions that were never built/deployed and failed
silently for months (admin-parks, admin-attractions, admin-park-prefixes,
admin-park-cameras, admin-support - all built & deployed July 2026). If
a staff form silently does nothing, check the function actually exists.

## Working conventions (established with John, do not break)

- **Never execute schema/data SQL directly.** Write it, `pbcopy` it,
  hand John the right SQL-editor link:
  shared: https://supabase.com/dashboard/project/kvpcwlcfgmsmarjtwpsx/sql/new
  operator: https://supabase.com/dashboard/project/xcrxltiiovpoladpaewd/sql/new
  Non-secret SQL also goes into `supabase/migrations/` and gets committed.
- **Never write real passwords/secrets into any file** (not even
  scratchpad). Credential-bearing SQL goes through `pbcopy` heredoc only.
- Git: `git fetch origin && git log HEAD..origin/main` + `git status`
  before committing; stage explicit paths, never `git add -A`.
- Edge function deploys:
  `npx supabase functions deploy <name> --project-ref <ref>` (John's Mac
  keychain holds the CLI login).
- The Supabase SQL editor caps results at 100 rows by default - for big
  exports have John raise the limit dropdown, export CSV, read the file
  from `~/Downloads`.
- Verification: `npx tsc --noEmit` in repo root.

## Staff dashboard - current state (July 2026)

- **Uebersicht** (`/staff/uebersicht`, the `/staff` landing page,
  `OverviewPage.tsx`): notifications feed (from `staff_notifications`,
  dismissible, realtime), shared checklist (`staff_checklist_items`),
  small follow-up/cost-due cards, and a per-park photo + today's-revenue
  browser (Imst listed first; select any park). A "Notizen" post-it
  feature existed briefly and was removed from the UI on user request -
  the `staff_handoff_notes` table still exists in the DB, unused.
- **`dispatch-lead-push`** is the single hub for ALL push notifications
  (leads, support tickets/replies, park inactivity, cost reminders,
  follow-ups), discriminated by a `table` field; it now also persists
  every notification into `staff_notifications` for the Uebersicht feed.
- **Park inactivity alert** cron fixed: 30-min threshold, 30-min grace
  after opening, compares against today's photos only (was firing at
  park opening every morning).
- **Kunden Management** tabs: Parks (incl. park password set at creation
  via admin-set-park-password on the operator project), Kameras, Liftpic
  (control panel for the on-PC Liftpic Sync agents: pairing codes,
  mode/shadow switches, asset/overlay slots, heartbeats).
- **Kosten**: cost_items is read-only from the client; changes go
  through migrations. Daily 11:00 UTC cron reminds of due payments and
  advances next_due_date.
- Microsoft Clarity (`xn8qg71gln`) is installed on the Imst and Tarzans
  claim pages, NOT on this dashboard.
- DB cleanup 2026-07-17: test parks "Adventure Land", "Plose Plosebob",
  "TestPark" fully deleted from both projects (22 child tables). Full
  file backup first at `~/Downloads/liftpictures-park-backup/`. The real
  park "Plose" was untouched. All their Stripe purchases were test-mode.

## Operator dashboard - current state (August 2026)

- **Personalisierung** (`/personalization`, `Personalization.tsx`) was
  overhauled 2026-08-19. Everything - live preview, saved-overlays gallery,
  the drag & drop builder, and the AI message/hint fields - now lives in
  ONE card ("Overlay-Bilder") with a switch: "Overlay erstellen" (default)
  vs. "Vorschau". Clicking a saved overlay in the preview gallery activates
  it directly (calls the same `activateUploadedOverlay` campaign-of-one
  mechanism as auto-apply-on-upload). Saving from the builder, uploading a
  ready file, and generating via AI all now respect one shared "sofort
  verwenden" toggle - no more separate re-upload step.
- **`AutomatBranding.tsx`** (the "Overlays aendern" card, sits above
  Personalisierung's own card) is a view/edit flow, not a form: pick a
  target (Foto-Overlay/Logo/Hintergrund) as a small switch, see the image
  **currently live on the machine**, hit "Aendern" to swap it. Sending
  stays in edit mode until the operator actually triggers a restart
  ("Verkaufsprogramm jetzt neu starten" / "Heute Nacht") - it used to
  bounce back to the (still-stale) preview immediately after sending,
  before the change was actually live; fixed 2026-08-19.
  - The live-image preview needs `bucket`/`storage_path` from
    `operator-liftpic-assets` (added + deployed 2026-08-19). The
    deployment bucket (`test`, see comment in that function) is **public**
    - use `getPublicUrl`, not `createSignedUrl`, or the preview silently
    stays empty (signed URLs need a Storage RLS read policy this bucket
    doesn't have).
- **`OverlayBuilder.tsx`** (the drag & drop editor inside "Overlay
  erstellen") was rebuilt Canva-style: a collapsible category rail
  (Format/Elemente/Text/Uploads/KI) instead of one crowded toolbar row,
  double-click a text element on the canvas to edit it in place, a
  session-local Uploads library (logo etc., insert repeatedly, delete
  individually - resets on page reload, not persisted server-side),
  AI-generate moved into its own category. Canvas base width is 900px
  (`DISPLAY_W`), scaled down to fit via `canvasScale`.
  - **Drag/resize math**: pointer delta is in real screen px, elements
    live in the `DISPLAY_W` design grid, so any delta MUST be divided by
    `canvasScale` before being applied - skipping that makes elements
    drift faster than the cursor, worst on small/scaled-down screens. Also
    needed for touch to work at all: `touchAction: 'none'` on draggable
    elements (otherwise the browser eats the gesture as a page scroll),
    pointer capture + `pointercancel` handling, and an explicit page
    scroll lock (`document.documentElement`/`body` touch-action +
    overscroll-behavior) during an active drag - plain `touch-action: none`
    on the element isn't enough on iOS Safari once it sits inside a
    `transform: scale()` ancestor, the page scrolls anyway without it.

## Payment attribution - card vs cash per purchase (Aug/Sep 2026)

- **`machine_sale_payments`** (shared project, migration
  `20260831004900`): permanent, one row per kiosk purchase, with
  `park_id`, `machine_id`, `sold_at`/`sold_local`, `bild_nr`,
  `method` (`karte`|`bar`|`unbekannt`), `method_source`, `amount_cents`,
  `card_scheme` (VISA/MASTERCARD/MAESTRO/V PAY/MC-E), `receipt_no`,
  `auth_code`, `pan_masked`, `source_file`. Dedup: unique partial index
  on `(machine_id, receipt_no)`. RLS: admin_users read-only.
- **Attribution logic**: the automat's `Statistic.txt` middle `||`-field
  is its own payment flag (`2`=Karte, `1`=Bar, `0`/absent=unknown).
  hobex `ZVT-YYYY-MM-0001-HDL.LOG` = one HAENDLERBELEG+KAUF+Genehmigt
  block per approved card sale; matched to the sale by in-block
  timestamp (per-day sequential alignment, PC/terminal clocks drift
  20-140s). Full parser: `scripts/zahlungen_imst.py`.
- **Imst backfill loaded** (via CSV Table Editor import, not the
  migration): 8925 rows. Karte 7087 (93%) / EUR 35,625; Bar 514 /
  EUR 2,570; unbekannt 1324 (all pre-2026-03, before the automat wrote
  a flag). Schemes ~ MC 45 / VISA 43 / MAESTRO 9 / V PAY 2.
- **Live path** (going forward): Liftpic Sync agent (`payments.py` in
  testsoftware, tag `v0.3.0-zahlungen`) parses the hobex HDL log +
  `Statistic.txt` flag, ships `sale_payments[]` (last ~45 min) in the
  heartbeat; `liftpic-status` edge fn (v7) dedups + inserts into
  `machine_sale_payments`. First live Imst sale confirmed 2026-08-31
  10:16 (Bild 56820, MASTERCARD, Beleg H179001). Needs `card_log_glob`
  set per machine (Liftpic tab -> PC bearbeiten).
- **Dashboard wiring**:
  - `operator-liftpic-health` (v13) builds a per-machine `payments`
    block from `machine_sale_payments` (`ledger_tage` query param,
    default 30). `ZahlungsUebersicht.tsx` renders it: Bar/Karte ring
    (no count inside the ring), Kartenmarken breakdown, adjustable
    period (Heute/7/30/90 Tage). Bar-Anteil is `null` (not "0 %") when
    < 50 % of sales are erkannt (F-037).
  - `operator-kiosk-purchases` (v2) -> `Purchases.tsx` (Kaeufe page):
    reads `machine_sale_payments` directly (not the 30-day `photos`
    table), so you can page months back. Month + Automat dropdown top
    right.
  - `park_machine_revenue()` SQL fn + `operator-machine-revenue` (v1)
    -> `Revenue.tsx` "Umsatz je Automat" card (shown when >= 2
    machines): per-automat Kaeufe/Betrag/Karte-%/period.
  - **Clone-PC guard**: if a park uses the ledger but a machine has no
    rows in it, `operator-liftpic-health` returns `payments: null`,
    `coin_inventory: null` for that machine (a freshly imaged PC would
    otherwise show the source PC's frozen `Statistic.txt`/`CoinStats`).

## Imst second automat - `pcneu2` / "Automat neu" (Sep 2026)

- Imst got a 2nd kiosk. Config row `machine_id='pcneu2'`,
  `camera_code='cam2'`, same `park_id` and same
  `legacy_customer_code='2734'` as `pcneu` ("Automat alt", `cam1`).
  `mode='sold_only'`, `settings.card_only=true` (no coin acceptor -
  coin_log_glob/coin_stats_file removed from its settings 2026-09-02).
- Liftpic Sync agent is paired, running, heartbeating; its camera takes
  photos. **But Automat 2 is NOT a working sales point yet - do not use
  it for real sales:**
  1. Its `Statistic.txt` is still the frozen clone from PC#1 (last line
     26.08.2026) - the kiosk sale/viewer software on PC#2 is not in live
     operation, so no sale line is written. Tom must finish the on-site
     setup and clear PC#2's cloned `Statistic.txt` / `CoinStats.txt` /
     `PrintCount.txt`.
  2. The new agent writes `photo_events` but **not the `photos` table**
     the claim page reads (open item #1), and PC#2 has no legacy
     uploader - so a purchased photo would never reach
     liftpictures-fotos.de.
  3. **Shared `2734` is a collision risk**: the claim page resolves a
     code by `park + Kundennummer(2734) + Datum + Bildnummer` (or the
     16-digit printed code). Both automats number Bildnummern
     independently; once PC#2's range overlaps PC#1's (~weeks at
     ~180/day) two different photos share one code. Fix before go-live:
     give Automat 2 its **own Kundennummer** (own claim pool + own
     printed-code prefix); revenue rollup is by `park_id` so the Imst
     total is unaffected.
- Deferred polish (do when Automat 2 goes live): frontend - for a
  `card_only` machine hide the empty Bar/Karte ring, show "Nur Karte" +
  Kartenmarken; agent `pruefe_verkauf()` - a card-only automat's
  unmatched sale should be `karte`, never `unbekannt`.

## Notifications rework (Aug/Sep 2026)

- **Schritt 1+2 DONE & deployed**: SystemHealth banner decoupled from
  service status, now data-freshness based (`quelleStatus` from
  `datenAlterMin`). Noise cut: `check_park_inactivity()` (migration
  `20260831183000`) only alerts on `uploader_disconnected` (heartbeat
  > 12 min stale) or `upload_stuck` (queue >= 10 + 30 min photo gap) -
  the plain "no photos for 30 min" alert is GONE (normal for a kiosk
  that only uploads on sale). Recovery message + 24 h dampener kept.
  `dispatch-operator-notifications` (v4) + `dispatch-lead-push` (v13):
  benign-event patterns, event-key normalisation, recency filter,
  `photo_inactivity` only fires when uploads actually hang.
- **Schritt 3-5 NOT started**: per-type on/off switches (Operator
  `Settings.tsx` + Staff `StaffSettingsPage.tsx`), notification inbox on
  the Systemzustand page (erledigt/archivieren/Papierkorb), shared
  `notification_type` enum. Needs `staff_notification_preferences` /
  `staff_notification_dispatch_state` tables + a
  `staff-notification-settings` edge fn.

## Open items / next steps

1. **Claim gap in Liftpic Sync ingest** (testsoftware repo):
   `liftpic-ingest-begin/commit` write only `photo_events`, not the
   `photos` table the claim pages read - must be added before a real
   customer is cut over to the new uploader. (Offered to build; John
   hasn't green-lit yet.)
2. **"Use Samuel's code" feature (Weg B)**: waiting on Tom for the
   `Statistic.txt` line format. If the printed 16-digit code is in
   there, Liftpic Sync should consume it instead of computing its own -
   root fix for the Imst "Foto nicht gefunden" class of bugs. The
   dashboard config field for the Statistic.txt path already exists
   (Liftpic tab -> PC bearbeiten).
3. Shadow-mode rollout of Liftpic Sync at a real customer (Imst or a
   Schausteller), compare with old uploader, then cut over.
4. `tomnotes2/testsoftware` is a stale duplicate of the uploader repo -
   John should archive it (only he can).
5. Verify migration `20260717090000_admin_set_park_password.sql` was
   actually run on the operator project (was handed off, never
   explicitly confirmed).
6. **Imst Automat 2 go-live** (see its section above): own Kundennummer
   for `pcneu2`, close the `photos`-ingest gap (or legacy uploader on
   PC#2), Tom clears the cloned files on PC#2. Then the deferred
   card_only frontend/agent polish.
7. **Notifications Schritt 3-5** (see its section above): per-type
   switches, notification inbox, shared enum.
8. Delta backfill for `machine_sale_payments`: small gap between the
   8925-row import (up to ~30.08 evening) and the agent rollout - John
   sends fresh `ZVT-...-HDL.LOG` + `Statistic.txt`, parse the delta
   with `scripts/zahlungen_imst.py`.

## People / customers quick reference

- **John** (john.m.nolting@gmail.com) - builds everything new, works
  via LLM agents, communicates in German.
- **Tom ("Papa")** - built/maintains the legacy on-PC chain (camera,
  AidaTest speed, Samuel viewer), does field installs. His knowledge:
  `testsoftware/docs/PC_SETUP_CHECKLIST.md`.
- Customers: Imster Bergbahnen (live, kiosk, liftpictures-fotos.de),
  CSS-ALPINE/Tarzans Sigulda (liftpictures-fotos-tarzans.de), Plose
  (own repo/funnel), traveling Schausteller (offline automats).
