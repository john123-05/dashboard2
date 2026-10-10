-- F1 (docs/PRODUKT_PLAN.md): E-Mail-Marketing der Parks, Versand über Make.
-- Shared-Projekt kvpcwlcfgmsmarjtwpsx. Namen `park_email_*`, weil `email_campaigns`/`email_sends`
-- dem Liftpictures-CRM gehören. Nur Service Role (Edge Functions).

create table if not exists public.park_email_settings (
  park_id uuid primary key references public.parks(id) on delete cascade,
  sender_name text not null,
  reply_to text not null,
  footer_address text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.park_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  name text not null,
  subject text not null default '',
  preheader text not null default '',
  language text,
  body_json jsonb not null default '[]'::jsonb,
  html text not null default '',
  segment jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipients integer not null default 0,
  opened integer not null default 0,
  clicked integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists park_email_campaigns_park_idx on public.park_email_campaigns (park_id, created_at desc);

create table if not exists public.park_email_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.park_email_campaigns(id) on delete cascade,
  park_id uuid not null,
  claim_id uuid,
  email text not null,
  status text not null default 'queued' check (status in ('queued', 'handed_over', 'failed', 'skipped')),
  send_after timestamptz not null default now(),
  handed_over_at timestamptz,
  opened_at timestamptz,
  error text,
  unique (campaign_id, email)
);
create index if not exists park_email_sends_queue_idx on public.park_email_sends (status, send_after) where status = 'queued';

create table if not exists public.park_email_usage (
  park_id uuid not null references public.parks(id) on delete cascade,
  month date not null,
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
