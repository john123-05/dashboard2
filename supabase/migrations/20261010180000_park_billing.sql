-- S1 (docs/PRODUKT_PLAN.md): Stripe-Kunde je Park. Shared-Projekt kvpcwlcfgmsmarjtwpsx.
create table if not exists public.park_billing (
  park_id uuid primary key references public.parks(id) on delete cascade,
  stripe_customer_id text unique,
  updated_at timestamptz not null default now()
);
alter table public.park_billing enable row level security;
revoke all on table public.park_billing from public, anon, authenticated;
