-- E1/E3 (docs/PRODUKT_PLAN.md): Social-Media-Kampagnen, Moderation, Teilen-Link-Zähler.
-- Shared-Projekt kvpcwlcfgmsmarjtwpsx. Nur Service Role (Edge Functions), keine Client-Rechte.

create table if not exists public.park_social_campaigns (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  name text not null,
  type text not null check (type in ('share_unlock', 'giveaway', 'record')),
  status text not null default 'draft' check (status in ('draft', 'active', 'ended')),
  hashtag text,
  mention text,
  prize text,
  rules_text jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  winner_entry_id uuid,
  drawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists park_social_campaigns_park_idx on public.park_social_campaigns (park_id, status);
create unique index if not exists park_social_campaigns_one_active
  on public.park_social_campaigns (park_id) where status = 'active';
alter table public.park_social_campaigns enable row level security;
revoke all on table public.park_social_campaigns from public, anon, authenticated;

alter table public.park_social_entries
  add column if not exists campaign_id uuid references public.park_social_campaigns(id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by text check (verified_by in ('manual', 'instagram')),
  add column if not exists photo_rights boolean not null default false,
  add column if not exists approved_at timestamptz;
create index if not exists park_social_entries_campaign_idx on public.park_social_entries (campaign_id);

create table if not exists public.park_share_links (
  token text primary key,
  park_id uuid not null references public.parks(id) on delete cascade,
  claim_id uuid not null,
  campaign_id uuid references public.park_social_campaigns(id) on delete set null,
  visits integer not null default 0,
  unique_visitors integer not null default 0,
  created_at timestamptz not null default now(),
  unique (claim_id)
);
create table if not exists public.park_share_visits (
  token text not null references public.park_share_links(token) on delete cascade,
  visitor_hash text not null,
  day date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (token, visitor_hash, day)
);
alter table public.park_share_links enable row level security;
alter table public.park_share_visits enable row level security;
revoke all on table public.park_share_links, public.park_share_visits from public, anon, authenticated;
