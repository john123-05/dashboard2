/*
  # Tables for the new Uebersicht (Overview) staff page

  - staff_notifications: a persisted, dismissible feed of the same events
    dispatch-lead-push already sends as push notifications (new leads, park
    inactivity, cost reminders, follow-ups due, support tickets/replies) -
    push is fire-and-forget, this gives staff a durable list to catch up on
    if they missed the push or want to review recent activity. Only the
    service-role (dispatch-lead-push itself) ever inserts; staff can only
    read and dismiss (set dismissed_at), never edit the content.
  - staff_checklist_items / staff_handoff_notes: simple shared
    create/read/delete tools for the same page - low-stakes, internal-only,
    so (unlike cost_items) staff can write directly rather than needing a
    dedicated edge function per action, matching the existing
    staff_credentials pattern.
*/

create table if not exists public.staff_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  url text,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);

alter table public.staff_notifications enable row level security;

drop policy if exists "Admins can read notifications" on public.staff_notifications;
create policy "Admins can read notifications"
  on public.staff_notifications
  for select
  to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()));

drop policy if exists "Admins can dismiss notifications" on public.staff_notifications;
create policy "Admins can dismiss notifications"
  on public.staff_notifications
  for update
  to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users where user_id = auth.uid()));
-- No insert/delete policy for anon/authenticated: only the service-role
-- (dispatch-lead-push) ever creates these.

create index if not exists idx_staff_notifications_active
  on public.staff_notifications (created_at desc)
  where dismissed_at is null;

create table if not exists public.staff_checklist_items (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text
);

alter table public.staff_checklist_items enable row level security;

drop policy if exists "Admins can manage checklist items" on public.staff_checklist_items;
create policy "Admins can manage checklist items"
  on public.staff_checklist_items
  for all
  to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users where user_id = auth.uid()));

create table if not exists public.staff_handoff_notes (
  id uuid primary key default gen_random_uuid(),
  note text not null,
  author_email text,
  created_at timestamptz not null default now()
);

alter table public.staff_handoff_notes enable row level security;

drop policy if exists "Admins can manage handoff notes" on public.staff_handoff_notes;
create policy "Admins can manage handoff notes"
  on public.staff_handoff_notes
  for all
  to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users where user_id = auth.uid()));

-- Additive only (no "enable row level security" here) - photos already has
-- RLS on from the claim-flow repos' own migrations, this just adds an
-- admin-scoped read path for the Uebersicht page's park photo preview,
-- without touching whatever policies already govern operator/anon access.
drop policy if exists "Staff admins can read all photos" on public.photos;
create policy "Staff admins can read all photos"
  on public.photos
  for select
  to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()));

-- One-time seed so the Uebersicht notifications box has something to show
-- before dispatch-lead-push has fired for real - only runs while the table
-- is still empty, so it's safe to re-run this migration.
insert into public.staff_notifications (title, body, url)
select * from (
  values
    ('Neue Website-Anfrage (Deutschland)', 'Max Mustermann · max@example.com', '/staff/website-anfragen?tab=germanWebsite'),
    ('Keine neuen Bilder bei Imst', 'Seit einer Stunde – einen Blick wert.', '/staff/kunden-management'),
    ('Neues Support-Ticket', 'Von Imster Bergbahnen (Hoch)', '/staff/support-ticket-kunden')
) as seed(title, body, url)
where not exists (select 1 from public.staff_notifications);
