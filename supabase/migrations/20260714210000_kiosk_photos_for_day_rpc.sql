-- Powers the Umsatz page's per-day hourly breakdown for kiosk parks: given
-- a park and a local calendar date, returns every photo captured that day
-- (in the park's own timezone). Unlike kiosk-photo-purchases' default
-- "last N purchases" mode, this is not recency-limited - a single busy day
-- can already exceed that endpoint's 300-row cap (Imst has hit ~400
-- photos/day), so an actual per-day query is needed rather than reusing
-- that endpoint's existing behavior.
--
-- Timezone-correct day bucketing is done here in SQL (at time zone) rather
-- than hand-rolled in the edge function's JS, matching how
-- rollup_kiosk_photo_sale() already buckets business_date - one proven
-- approach instead of two.
create or replace function public.get_kiosk_photos_for_day(p_park_id uuid, p_business_date date)
returns table (id uuid, captured_at timestamptz, camera_code text)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    coalesce(p.captured_at, p.created_at) as captured_at,
    coalesce(p.camera_code, 'unknown') as camera_code
  from public.photos p
  join public.parks pk on pk.id = p.park_id
  where p.park_id = p_park_id
    and (coalesce(p.captured_at, p.created_at) at time zone coalesce(pk.timezone, 'Europe/Vienna'))::date = p_business_date
  order by captured_at asc;
$$;

grant execute on function public.get_kiosk_photos_for_day(uuid, date) to service_role;
