/*
  # Fix park inactivity alert + tell "uploader disconnected" apart from "no photos"

  Why:
  1. The 2026-07-17 fix (20260717130000_fix_park_inactivity_false_alarm_at_
     opening.sql) that added a 30-min grace period after opening and scoped
     the "last photo" lookup to today's session was written and committed,
     but never actually run on this project - the live function was still
     the 2026-07-14 original, which compares against the park's *all-time*
     last photo (including yesterday evening's). Every morning, the instant
     "now" entered the park's opening-hours window, that gap was already
     many hours old, so the alert fired right at/near opening, long before
     anyone could plausibly have ridden (observed: firing ~09:30 daily at
     Imst, well before real opening). This migration is that same fix,
     applied for real this time.
  2. New: distinguishes "uploader disconnected" from "genuinely no riders".
     Both look identical from photos alone (no new rows either way) - the
     2026-08-07 Imst outage was exactly this: the agent was alive and
     capturing but couldn't authenticate, so photos stopped for a reason
     that had nothing to do with foot traffic. Now cross-checks the park's
     liftpic_machine_configs -> machine_status heartbeat; if that's stale
     (>=15 min, well past the default 60s heartbeat interval) the alert
     fires with reason 'uploader_disconnected' instead of 'no_photos', and
     bypasses the photo-age threshold (a dead connection is worth flagging
     immediately, not after another 30 minutes). dispatch-lead-push renders
     a distinct, more actionable notification for that case.
     Parks with no active Liftpic Sync machine (still on the legacy chain)
     simply see no heartbeat row and behave exactly as before.
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
  v_last_heartbeat_at timestamptz;
  v_heartbeat_minutes_since integer;
  v_heartbeat_stale_minutes constant integer := 15;
  v_is_connection_alert boolean;
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

      -- Cross-check the machine's own heartbeat before trusting "no photos"
      -- to mean "no riders". A stale heartbeat means the agent can't reach
      -- us at all, which is a different, more urgent problem.
      select max(ms.last_seen_at) into v_last_heartbeat_at
      from public.machine_status ms
      join public.liftpic_machine_configs mc on mc.machine_id = ms.machine_id
      where mc.park_id = park_record.id
        and mc.is_active = true;

      v_is_connection_alert := false;
      v_heartbeat_minutes_since := null;
      if v_last_heartbeat_at is not null then
        v_heartbeat_minutes_since := extract(epoch from (now() - v_last_heartbeat_at)) / 60;
        if v_heartbeat_minutes_since >= v_heartbeat_stale_minutes then
          v_is_connection_alert := true;
        end if;
      end if;

      select max(coalesce(captured_at, created_at)) into v_last_photo_at
      from public.photos
      where park_id = park_record.id
        and coalesce(captured_at, created_at) >= v_opening_at;

      -- No photo yet today: measure the gap from opening time itself,
      -- rather than skipping (old code) or comparing to yesterday (the bug).
      v_effective_last_at := coalesce(v_last_photo_at, v_opening_at);

      v_minutes_since := extract(epoch from (now() - v_effective_last_at)) / 60;
      if not v_is_connection_alert and v_minutes_since < v_threshold_minutes then
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
            'minutes_since_last_photo', v_minutes_since,
            'reason', case when v_is_connection_alert then 'uploader_disconnected' else 'no_photos' end,
            'minutes_since_heartbeat', v_heartbeat_minutes_since
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
