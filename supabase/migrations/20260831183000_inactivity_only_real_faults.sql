/*
  # Park-Inaktivität: nur noch bei echten Störungen, nicht bei "keiner kauft"

  Beschwerde des Betreibers: er bekommt "Keine neuen Bilder bei Imst" und
  "Verbindung verloren", obwohl der Automat die ganze Zeit läuft. Grund: die
  bisherige Logik feuerte, sobald 30 Minuten lang kein Foto in der photos-
  Tabelle ankam. Bei einem Automaten wird ein Foto aber nur beim VERKAUF
  hochgeladen - eine halbe Stunde ohne Verkauf ist normaler Betrieb, keine
  Störung.

  Ab jetzt löst check_park_inactivity() nur noch aus bei:
    - 'uploader_disconnected': der Herzschlag des Automaten ist > 12 Minuten
      alt (er schlägt sonst etwa jede Minute) - der Agent erreicht uns nicht
      mehr.
    - 'upload_stuck': Herzschlag frisch, aber der Agent meldet >= 10 Fotos in
      der Warteschlange UND seit >= 30 min ist keins durchgekommen - Fotos
      stauen sich, der Upload hängt (der 07.08.2026-Fall).

  Ein reiner "seit X keine Fotos"-Alarm gibt es NICHT mehr. Recovery-Meldung
  und die 24-Stunden-Dämpfung bleiben.
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
  v_photo_gap_minutes constant integer := 30;
  v_last_heartbeat_at timestamptz;
  v_heartbeat_minutes_since integer;
  v_heartbeat_stale_minutes constant integer := 12;
  v_queue_count integer;
  v_queue_stuck_threshold constant integer := 10;
  v_reason text;
  v_newest_photo_at timestamptz;
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
      -- Herzschlag + Warteschlange des (jüngsten) aktiven Automaten holen.
      select ms.last_seen_at,
             nullif(mc.last_status->>'queue_count','')::int
      into v_last_heartbeat_at, v_queue_count
      from public.machine_status ms
      join public.liftpic_machine_configs mc on mc.machine_id = ms.machine_id
      where mc.park_id = park_record.id
        and mc.is_active = true
      order by ms.last_seen_at desc
      limit 1;

      v_heartbeat_minutes_since := null;
      if v_last_heartbeat_at is not null then
        v_heartbeat_minutes_since := extract(epoch from (now() - v_last_heartbeat_at)) / 60;
      end if;

      select * into v_alert_row from public.park_inactivity_alerts where park_id = park_record.id;

      -- ---------- RECOVERY ----------
      if v_alert_row.park_id is not null then
        select max(coalesce(captured_at, created_at)) into v_newest_photo_at
        from public.photos
        where park_id = park_record.id
          and coalesce(captured_at, created_at) > coalesce(v_alert_row.last_alerted_photo_at, 'epoch'::timestamptz);

        if v_newest_photo_at is not null
           or (v_heartbeat_minutes_since is not null
               and v_heartbeat_minutes_since < v_heartbeat_stale_minutes) then
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
                'reason', 'recovered'
              )
            )
          );
          delete from public.park_inactivity_alerts where park_id = park_record.id;
          select * into v_alert_row from public.park_inactivity_alerts where park_id = park_record.id;
        end if;
      end if;

      -- ---------- Öffnungszeiten / Grace ----------
      v_now_local := now() at time zone coalesce(park_record.timezone, 'Europe/Vienna');
      v_day_key := (array['mon','tue','wed','thu','fri','sat','sun'])[extract(isodow from v_now_local)::int];
      v_hours := park_record.opening_hours -> v_day_key;

      if v_hours is null or jsonb_typeof(v_hours) <> 'array' or jsonb_array_length(v_hours) < 2 then
        continue;
      end if;

      v_within_hours := v_now_local::time between (v_hours ->> 0)::time and (v_hours ->> 1)::time;
      if not v_within_hours then
        continue;
      end if;

      v_opening_local := date_trunc('day', v_now_local) + (v_hours ->> 0)::time;
      v_opening_at := v_opening_local at time zone coalesce(park_record.timezone, 'Europe/Vienna');

      v_minutes_since_opening := extract(epoch from (v_now_local - v_opening_local)) / 60;
      if v_minutes_since_opening < v_grace_minutes then
        continue;
      end if;

      select max(coalesce(captured_at, created_at)) into v_last_photo_at
      from public.photos
      where park_id = park_record.id
        and coalesce(captured_at, created_at) >= v_opening_at;

      v_effective_last_at := coalesce(v_last_photo_at, v_opening_at);
      v_minutes_since := extract(epoch from (now() - v_effective_last_at)) / 60;

      -- ---------- Ist das eine echte Störung? ----------
      v_reason := null;

      if v_heartbeat_minutes_since is not null
         and v_heartbeat_minutes_since >= v_heartbeat_stale_minutes then
        -- Der Automat meldet sich nicht mehr.
        v_reason := 'uploader_disconnected';
      elsif coalesce(v_queue_count, 0) >= v_queue_stuck_threshold
            and v_minutes_since >= v_photo_gap_minutes then
        -- Automat lebt, aber Fotos stauen sich und nichts geht raus.
        v_reason := 'upload_stuck';
      end if;

      if v_reason is null then
        continue;  -- kein Foto seit einer Weile, aber alles gesund -> nichts.
      end if;

      -- Schon gemeldet, kein neueres Foto seither -> nur alle 24 h wiederholen.
      if v_alert_row.park_id is not null
         and v_alert_row.last_alerted_photo_at >= v_effective_last_at
         and v_alert_row.last_alerted_at > now() - interval '24 hours' then
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
            'reason', v_reason,
            'minutes_since_heartbeat', v_heartbeat_minutes_since,
            'queue_count', v_queue_count
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
