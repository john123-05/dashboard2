-- F3 (docs/PRODUKT_PLAN.md): E-Mail-Automationen (Pro). Shared-Projekt kvpcwlcfgmsmarjtwpsx.
-- `is_template`: Vorlage einer Automation – wird nie als Ganzes versendet, bleibt Entwurf.

alter table public.park_email_campaigns add column if not exists is_template boolean not null default false;

create table if not exists public.park_email_automations (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  type text not null check (type in ('welcome', 'season_start', 'photo_reminder')),
  enabled boolean not null default false,
  campaign_id uuid references public.park_email_campaigns(id) on delete set null,
  delay_hours integer not null default 0 check (delay_hours between 0 and 720),
  updated_at timestamptz not null default now(),
  unique (park_id, type)
);
alter table public.park_email_automations enable row level security;
revoke all on table public.park_email_automations from public, anon, authenticated;
