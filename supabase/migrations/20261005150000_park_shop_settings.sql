/*
  # Shop-Einstellungen je Park (Second Chance Sales)

  Preis, Akzentfarbe und Logo fuer den "Second Chance Sales"-Shop-Prototyp,
  vom Betreiber selbst im Dashboard gepflegt (nicht nur Staff im CRM). Nur
  ueber Service-Role-Edge-Functions gelesen/geschrieben, kein Client-RLS
  noetig - gleiches Muster wie park_survey_settings/operator-survey.
*/

create table if not exists public.park_shop_settings (
  park_id uuid primary key references public.parks(id) on delete cascade,
  price_cents integer not null default 499,
  accent_color text not null default '#C6A233',
  logo_url text,
  updated_at timestamptz not null default now()
);

-- No policies: only the service-role edge functions may read/write.
alter table public.park_shop_settings enable row level security;

alter table public.photo_claims
  add column if not exists amount_cents integer;

insert into storage.buckets (id, name, public)
values ('shop-branding', 'shop-branding', true)
on conflict (id) do nothing;
