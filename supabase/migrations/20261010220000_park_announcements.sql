-- HW1 (docs/AUSBAU_PLAN.md): Hinweise (Pop-ups) aus dem Liftpictures-CRM für das Betreiber-Dashboard.
-- Shared-Projekt kvpcwlcfgmsmarjtwpsx. Nur Service Role (Edge Functions).
create table if not exists public.park_announcements (
  id uuid primary key default gen_random_uuid(),
  park_id uuid references public.parks(id) on delete cascade,   -- null = alle Parks
  title text not null,
  body text not null default '',
  cta_label text,
  cta_url text,
  qr_url text,
  position text not null default 'bottom-right'
    check (position in ('bottom-right', 'bottom-left', 'top-right', 'top-left', 'center')),
  pages text[] not null default '{}',                           -- leer = auf jeder Seite
  audience text not null default 'all' check (audience in ('all', 'owner', 'staff')),
  tone text not null default 'info' check (tone in ('info', 'offer', 'warning')),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists park_announcements_park_idx on public.park_announcements (park_id, active);

create table if not exists public.park_announcement_events (
  announcement_id uuid not null references public.park_announcements(id) on delete cascade,
  park_id uuid not null,
  user_id text not null,
  event text not null check (event in ('seen', 'clicked', 'dismissed')),
  created_at timestamptz not null default now(),
  primary key (announcement_id, park_id, user_id, event)
);

alter table public.park_announcements enable row level security;
alter table public.park_announcement_events enable row level security;
revoke all on table public.park_announcements, public.park_announcement_events from public, anon, authenticated;
