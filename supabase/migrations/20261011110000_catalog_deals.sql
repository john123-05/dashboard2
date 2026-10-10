-- PK4/PK5 (docs/AUSBAU_PLAN.md): Rabatte je Kunde und Aktionen. Shared-Projekt kvpcwlcfgmsmarjtwpsx. Nur Service Role.
create table if not exists public.park_price_overrides (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  package_key text not null references public.catalog_packages(key) on delete cascade,
  discount_percent int check (discount_percent between 1 and 100),
  fixed_price_cents int check (fixed_price_cents >= 0),
  extra_free_months int not null default 0 check (extra_free_months between 0 and 36),
  note text,
  valid_until date,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  unique (park_id, package_key)
);
create table if not exists public.catalog_promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  texts jsonb not null default '{}'::jsonb,        -- { de:{ title, banner }, en:{…}, … }
  discount_percent int check (discount_percent between 1 and 100),
  free_months int not null default 0 check (free_months between 0 and 36),
  package_keys text[] not null default '{}',       -- leer = alle Pakete
  audience jsonb not null default '{"all": true}'::jsonb,   -- {all:true} | {plans:[…]} | {park_ids:[…]}
  starts_on date,
  ends_on date,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now()
);
create table if not exists public.catalog_promotion_events (
  promotion_id uuid not null references public.catalog_promotions(id) on delete cascade,
  park_id uuid not null,
  event text not null check (event in ('seen', 'requested', 'booked')),
  created_at timestamptz not null default now(),
  primary key (promotion_id, park_id, event)
);
alter table public.park_price_overrides enable row level security;
alter table public.catalog_promotions enable row level security;
alter table public.catalog_promotion_events enable row level security;
revoke all on table public.park_price_overrides, public.catalog_promotions, public.catalog_promotion_events from public, anon, authenticated;
