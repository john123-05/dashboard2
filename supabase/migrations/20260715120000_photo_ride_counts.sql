-- Daily ride/photo-taken counters sent by liftpic-sync heartbeats.
-- This table stores telemetry only: no unsold JPEGs need to be uploaded just
-- to calculate conversion in the operator dashboard.
create table if not exists public.park_photo_ride_daily (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  park_slug text,
  machine_id text not null,
  camera_code text not null default 'default',
  business_date date not null,
  photos_taken_count integer not null default 0,
  photos_sold_count integer not null default 0,
  conversion_rate numeric,
  first_capture_at timestamptz,
  last_capture_at timestamptz,
  last_sale_at timestamptz,
  speed_ok_count integer not null default 0,
  last_seen_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (machine_id, camera_code, business_date)
);

alter table public.park_photo_ride_daily enable row level security;

create index if not exists park_photo_ride_daily_park_date_idx
  on public.park_photo_ride_daily(park_id, business_date desc);

drop policy if exists "Admins can read photo ride rollup" on public.park_photo_ride_daily;
create policy "Admins can read photo ride rollup"
  on public.park_photo_ride_daily
  for select
  to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()));

create or replace function public.touch_photo_ride_daily_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_photo_ride_daily_updated_at on public.park_photo_ride_daily;
create trigger trg_photo_ride_daily_updated_at
before update on public.park_photo_ride_daily
for each row execute function public.touch_photo_ride_daily_updated_at();
