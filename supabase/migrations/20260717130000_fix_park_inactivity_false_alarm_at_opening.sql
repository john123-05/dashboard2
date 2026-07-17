/*
  # Fix park inactivity alert firing right at opening time

  Why:
  check_park_inactivity() compared "now" against the park's *last photo
  ever* - including yesterday's. The moment a park's opening hours started
  today, that gap was already many hours old (overnight), so the alert fired
  immediately at/just after opening every single day, long before anyone
  could realistically have ridden yet. Also lowers the threshold from 60 to
  30 minutes per request.

  What:
  1. Adds a 30-minute grace period after opening before checking anything -
     nobody has necessarily ridden that soon, that's not a broken camera.
  2. Scopes the "last photo" lookup to *today's* opening session only, not
     all-time - so a quiet morning is judged against when today's riders
     could first have shown up, not against last night's closing time.
  3. Threshold for "how long is too long" drops from 60 to 30 minutes.
  Same dedup/re-alert bookkeeping as before (park_inactivity_alerts,
  2h cooldown on repeat reminders) - untouched.
*/
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
  v_opening_local timestamp;
  v_opening_at timestamptz;
  v_minutes_since_opening integer;
  v_last_photo_at timestamptz;
  v_effective_last_at timestamptz;
  v_minutes_since integer;
  v_alert_row record;
  v_grace_minutes constant integer := 30;
  v_threshold_minutes constant integer := 30;
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

      v_opening_local := date_trunc('day', v_now_local) + (v_hours ->> 0)::time;
      v_opening_at := v_opening_local at time zone coalesce(park_record.timezone, 'Europe/Vienna');

      v_minutes_since_opening := extract(epoch from (v_now_local - v_opening_local)) / 60;
      if v_minutes_since_opening < v_grace_minutes then
        continue; -- just opened, nobody has necessarily ridden yet
      end if;

      select max(coalesce(captured_at, created_at)) into v_last_photo_at
      from public.photos
      where park_id = park_record.id
        and coalesce(captured_at, created_at) >= v_opening_at;

      -- No photo yet today: measure the gap from opening time itself,
      -- rather than skipping (old code) or comparing to yesterday (the bug).
      v_effective_last_at := coalesce(v_last_photo_at, v_opening_at);

      v_minutes_since := extract(epoch from (now() - v_effective_last_at)) / 60;
      if v_minutes_since < v_threshold_minutes then
        continue;
      end if;

      select * into v_alert_row from public.park_inactivity_alerts where park_id = park_record.id;

      -- Skip if we already alerted about this same gap (no newer photo since
      -- then), unless it's been over 2h since that alert - an occasional
      -- reminder if the gap just keeps going.
      if v_alert_row.park_id is not null
         and v_alert_row.last_alerted_photo_at >= v_effective_last_at
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
      values (park_record.id, now(), v_effective_last_at)
      on conflict (park_id) do update
        set last_alerted_at = now(),
            last_alerted_photo_at = excluded.last_alerted_photo_at;
    exception when others then
      raise warning 'check_park_inactivity failed for park %: %', park_record.id, sqlerrm;
    end;
  end loop;
end;
$$;
