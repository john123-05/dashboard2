-- Alerts staff when a kiosk-model park has had no new photos for over an
-- hour during its configured opening hours - e.g. Imst's Alpine Coaster
-- camera going quiet mid-day usually means the camera/upload pipeline broke,
-- not that visitors stopped riding. Reuses parks.opening_hours (previously
-- "optional display/reference only", see 20260714090000_kiosk_photo_sales_
-- rollup.sql) as the actual gate for this check. Generic across any kiosk
-- park (price_per_photo_cents is not null) with opening_hours configured -
-- not Imst-specific, so it applies automatically to future kiosk parks too.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.park_inactivity_alerts (
  park_id uuid primary key references public.parks(id) on delete cascade,
  last_alerted_at timestamptz not null,
  last_alerted_photo_at timestamptz not null
);

alter table public.park_inactivity_alerts enable row level security;

drop policy if exists "Admins can read park inactivity alerts" on public.park_inactivity_alerts;
create policy "Admins can read park inactivity alerts"
  on public.park_inactivity_alerts
  for select
  to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()));
-- No insert/update/delete policy for anon/authenticated: only the
-- security-definer function below ever writes to this table.

create or replace function public.check_park_inactivity()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  dispatch_secret text;
  park_record record;
  v_now_local timestamp;
  v_day_key text;
  v_hours jsonb;
  v_within_hours boolean;
  v_last_photo_at timestamptz;
  v_minutes_since integer;
  v_alert_row record;
begin
  select decrypted_secret into dispatch_secret
  from vault.decrypted_secrets
  where name = 'dispatch_push_secret';

  if dispatch_secret is null then
    return;
  end if;

  for park_record in
    select id, name, timezone, opening_hours
    from public.parks
    where price_per_photo_cents is not null
      and opening_hours is not null
  loop
    begin
      v_now_local := now() at time zone coalesce(park_record.timezone, 'Europe/Vienna');
      -- isodow: 1=Monday..7=Sunday - used instead of to_char(..,'dy') since
      -- that can be affected by the database's locale setting.
      v_day_key := (array['mon','tue','wed','thu','fri','sat','sun'])[extract(isodow from v_now_local)::int];
      v_hours := park_record.opening_hours -> v_day_key;

      if v_hours is null or jsonb_typeof(v_hours) <> 'array' or jsonb_array_length(v_hours) < 2 then
        continue; -- closed today, or no hours configured for today
      end if;

      v_within_hours := v_now_local::time between (v_hours ->> 0)::time and (v_hours ->> 1)::time;
      if not v_within_hours then
        continue;
      end if;

      select max(coalesce(captured_at, created_at)) into v_last_photo_at
      from public.photos
      where park_id = park_record.id;

      if v_last_photo_at is null then
        continue; -- no photos ever yet, nothing to compare against
      end if;

      v_minutes_since := extract(epoch from (now() - v_last_photo_at)) / 60;
      if v_minutes_since < 60 then
        continue;
      end if;

      select * into v_alert_row from public.park_inactivity_alerts where park_id = park_record.id;

      -- Skip if we already alerted about this same gap (no newer photo since
      -- then), unless it's been over 2h since that alert - an occasional
      -- reminder if the gap just keeps going.
      if v_alert_row.park_id is not null
         and v_alert_row.last_alerted_photo_at >= v_last_photo_at
         and v_alert_row.last_alerted_at > now() - interval '2 hours' then
        continue;
      end if;

      perform net.http_post(
        url := 'https://kvpcwlcfgmsmarjtwpsx.supabase.co/functions/v1/dispatch-lead-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Dispatch-Secret', dispatch_secret
        ),
        body := jsonb_build_object(
          'table', 'park_inactivity',
          'record', jsonb_build_object(
            'park_id', park_record.id,
            'park_name', park_record.name,
            'minutes_since_last_photo', v_minutes_since
          )
        )
      );

      insert into public.park_inactivity_alerts (park_id, last_alerted_at, last_alerted_photo_at)
      values (park_record.id, now(), v_last_photo_at)
      on conflict (park_id) do update
        set last_alerted_at = now(),
            last_alerted_photo_at = excluded.last_alerted_photo_at;
    exception when others then
      raise warning 'check_park_inactivity failed for park %: %', park_record.id, sqlerrm;
    end;
  end loop;
end;
$$;

select cron.schedule(
  'check-park-inactivity',
  '*/15 * * * *',
  $$select public.check_park_inactivity();$$
);
