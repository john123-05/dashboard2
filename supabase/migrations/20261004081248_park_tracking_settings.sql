-- Shared/content project kvpcwlcfgmsmarjtwpsx. IDs are public tag identifiers,
-- never a script snippet or secret. Only operator-survey may change a row.
create table if not exists public.park_tracking_settings (
  park_id uuid primary key references public.parks(id) on delete cascade,
  enabled boolean not null default false,
  meta_pixel_id text not null default '' check (meta_pixel_id = '' or meta_pixel_id ~ '^[0-9]{8,20}$'),
  google_ads_id text not null default '' check (google_ads_id = '' or google_ads_id ~ '^AW-[0-9]{6,20}$'),
  updated_at timestamptz not null default now(),
  constraint park_tracking_settings_enabled_has_id check (
    not enabled or meta_pixel_id <> '' or google_ads_id <> ''
  )
);

alter table public.park_tracking_settings enable row level security;
grant select on public.park_tracking_settings to anon, authenticated;

-- The claim page needs only the IDs and enabled state. No public writes.
drop policy if exists "park tracking settings public read" on public.park_tracking_settings;
create policy "park tracking settings public read" on public.park_tracking_settings
  for select to anon, authenticated using (true);
