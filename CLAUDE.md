# dashboard2 - Agent Context

Read this first. It carries the full working context so a fresh session
can continue where the last one stopped. Last updated 2026-07-18.

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
  photo_events. Client: `supabaseBrowser` from `src/staff/lib/supabase.ts`.
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

## People / customers quick reference

- **John** (john.m.nolting@gmail.com) - builds everything new, works
  via LLM agents, communicates in German.
- **Tom ("Papa")** - built/maintains the legacy on-PC chain (camera,
  AidaTest speed, Samuel viewer), does field installs. His knowledge:
  `testsoftware/docs/PC_SETUP_CHECKLIST.md`.
- Customers: Imster Bergbahnen (live, kiosk, liftpictures-fotos.de),
  CSS-ALPINE/Tarzans Sigulda (liftpictures-fotos-tarzans.de), Plose
  (own repo/funnel), traveling Schausteller (offline automats).
