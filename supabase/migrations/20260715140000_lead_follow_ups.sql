-- A manually-set "next follow-up" reminder per person (keyed by email, same
-- convention as lead_contact_events, so one follow-up covers a person across
-- every list they appear in). Deliberately never auto-scheduled by logging a
-- contact - staff always sets/changes this themselves. cadence_days is
-- optional: if set, marking a follow-up "erledigt" re-schedules it that many
-- days out instead of clearing it.

create table if not exists public.lead_follow_ups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  next_due_at date not null,
  cadence_days integer,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lead_follow_ups_email
  on public.lead_follow_ups (lower(btrim(email)));

alter table public.lead_follow_ups enable row level security;
-- Deliberately no policies: exactly like lead_contact_events, every
-- read/write goes through the admin-lead-follow-ups edge function
-- (service-role), never a direct client query. The edge function itself
-- enforces "one active row per email" (select-then-insert-or-update) rather
-- than a DB uniqueness constraint, since the lookup key is normalized
-- (lower/trim) rather than the raw column.
