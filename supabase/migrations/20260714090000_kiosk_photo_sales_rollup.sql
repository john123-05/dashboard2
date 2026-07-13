-- Kiosk-model parks (photos are only ever uploaded once paid for at a
-- self-service machine, e.g. Imst's Alpine Coaster) don't need Stripe/shop
-- data to know their revenue: every stored photo IS a sale at a fixed
-- price, and the camera's own sequential file numbering reveals how many
-- rides were *not* purchased (gaps in the sequence). This is additive and
-- inert for every other park — price_per_photo_cents stays null for them,
-- and the trigger below no-ops whenever that's the case.
alter table public.parks add column if not exists price_per_photo_cents integer;
alter table public.parks add column if not exists timezone text not null default 'Europe/Vienna';
alter table public.parks add column if not exists opening_hours jsonb;

comment on column public.parks.price_per_photo_cents is
  'Set only for self-service/kiosk parks with no real shop — every photos row for this park is then treated as one completed sale at this price. Null = not a kiosk-model park.';
comment on column public.parks.opening_hours is
  'Optional display/reference only, e.g. {"mon":["09:00","18:00"],...,"sun":null}. The daily rollup below only relies on timezone for correct local-date bucketing, not on these exact hours.';

update public.parks
set price_per_photo_cents = 500,
    timezone = 'Europe/Vienna'
where id = '85c77b81-9f9b-4b4e-9f70-9c6ffa0b9b14' -- Imst (Imster Bergbahnen / Alpine Coaster)
  and price_per_photo_cents is null;

-- Permanent per-camera daily rollup. photos rows themselves get hard-deleted
-- 30 days after capture (see liftpictures-claim-imst's archive-expired-photos
-- function), so this table is the only place kiosk revenue/conversion
-- history survives past that window. It's built incrementally by the
-- trigger below at insert time, never batch-recomputed from photos later —
-- so it's immune to that 30-day purge (and to any later manual deletion of
-- individual photos, which shouldn't retroactively erase a completed sale).
create table if not exists public.park_photo_sales_daily (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  camera_code text not null default 'unknown',
  business_date date not null,
  photos_sold_count integer not null default 0,
  min_file_code integer,
  max_file_code integer,
  updated_at timestamptz not null default now(),
  unique (park_id, camera_code, business_date)
);

alter table public.park_photo_sales_daily enable row level security;

drop policy if exists "Admins can read photo sales rollup" on public.park_photo_sales_daily;
create policy "Admins can read photo sales rollup"
  on public.park_photo_sales_daily
  for select
  to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()));
-- No insert/update/delete policy for anon/authenticated: only the trigger
-- (security definer) and the one-off backfill below ever write to this table.

create or replace function public.rollup_kiosk_photo_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price_cents integer;
  v_tz text;
  v_business_date date;
  v_file_code integer;
begin
  -- Never let an analytics rollup break photo ingestion itself.
  begin
    select price_per_photo_cents, timezone into v_price_cents, v_tz
    from public.parks where id = NEW.park_id;

    if v_price_cents is null then
      return NEW; -- not a kiosk-model park, nothing to roll up
    end if;

    v_business_date := (coalesce(NEW.captured_at, NEW.created_at) at time zone coalesce(v_tz, 'Europe/Vienna'))::date;
    v_file_code := case when NEW.source_file_code ~ '^[0-9]+$' then NEW.source_file_code::integer else null end;

    insert into public.park_photo_sales_daily as psd
      (park_id, camera_code, business_date, photos_sold_count, min_file_code, max_file_code)
    values
      (NEW.park_id, coalesce(NEW.camera_code, 'unknown'), v_business_date, 1, v_file_code, v_file_code)
    on conflict (park_id, camera_code, business_date) do update
      set photos_sold_count = psd.photos_sold_count + 1,
          min_file_code = least(psd.min_file_code, excluded.min_file_code),
          max_file_code = greatest(psd.max_file_code, excluded.max_file_code),
          updated_at = now();
  exception when others then
    raise warning 'rollup_kiosk_photo_sale failed for photo %: %', NEW.id, sqlerrm;
  end;

  return NEW;
end;
$$;

drop trigger if exists trg_rollup_kiosk_photo_sale on public.photos;
create trigger trg_rollup_kiosk_photo_sale
  after insert on public.photos
  for each row execute function public.rollup_kiosk_photo_sale();

-- One-off backfill so the dashboard has data immediately instead of only
-- starting from the next photo taken. Only covers whatever's currently in
-- photos (up to ~30 days per the retention policy above) - anything older
-- was never rolled up and can't be recovered from photos at this point.
insert into public.park_photo_sales_daily (park_id, camera_code, business_date, photos_sold_count, min_file_code, max_file_code)
select
  p.park_id,
  coalesce(p.camera_code, 'unknown') as camera_code,
  (coalesce(p.captured_at, p.created_at) at time zone coalesce(pk.timezone, 'Europe/Vienna'))::date as business_date,
  count(*) as photos_sold_count,
  min(case when p.source_file_code ~ '^[0-9]+$' then p.source_file_code::integer end) as min_file_code,
  max(case when p.source_file_code ~ '^[0-9]+$' then p.source_file_code::integer end) as max_file_code
from public.photos p
join public.parks pk on pk.id = p.park_id
where pk.price_per_photo_cents is not null
group by p.park_id, coalesce(p.camera_code, 'unknown'),
  (coalesce(p.captured_at, p.created_at) at time zone coalesce(pk.timezone, 'Europe/Vienna'))::date
on conflict (park_id, camera_code, business_date) do update
  set photos_sold_count = excluded.photos_sold_count,
      min_file_code = excluded.min_file_code,
      max_file_code = excluded.max_file_code,
      updated_at = now();
