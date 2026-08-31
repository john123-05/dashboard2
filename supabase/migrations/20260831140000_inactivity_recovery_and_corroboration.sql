/*
  # Park-Inaktivität: "wieder ok"-Meldung + Live-Beleg für "Uploader getrennt"

  Zwei Änderungen an check_park_inactivity() gegenüber
  20260830234500_inactivity_alert_stop_2h_repeat.sql:

  1. RECOVERY. Bisher gab es nur einen Alarm, nie eine Entwarnung - die
     `park_inactivity_alerts`-Zeile blieb stehen, und im Betrieb wusste
     niemand, ob eine gemeldete Störung noch besteht. Jetzt: sobald ein Park
     mit offenem Alarm wieder gesund aussieht (frischer Herzschlag ODER ein
     Foto neuer als der letzte Alarm), geht eine `reason = 'recovered'`-
     Meldung raus und die Alarm-Zeile wird gelöscht. Das läuft VOR der
     Öffnungszeiten-Prüfung, damit auch eine Erholung über Nacht quittiert
     wird.

  2. LIVE-BELEG für 'uploader_disconnected'. Ein 15-Minuten-alter Herzschlag
     allein reichte für "Verbindung zum Automaten verloren" - das feuerte
     auch bei einem kurzen Netz-Hüpfer oder wenn der Herzschlag-Endpunkt
     kurz klemmte, obwohl der Automat weiterlief. Jetzt gilt der
     Verbindungsalarm nur, wenn der Herzschlag stale ist (Schwelle auf
     25 Min erhöht) UND in der laufenden Sitzung noch KEIN Foto ankam. Kommen
     Fotos, erreicht uns der Agent offensichtlich - dann ist es höchstens
     "keine Fahrgäste", kein Verbindungsabriss.
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
  v_heartbeat_stale_minutes constant integer := 25;
  v_is_connection_alert boolean;
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
      -- Herzschlag + Alarm-Zeile ZUERST holen - beides wird auch für die
      -- Recovery-Prüfung gebraucht, die vor den Öffnungszeiten läuft.
      select max(ms.last_seen_at) into v_last_heartbeat_at
      from public.machine_status ms
      join public.liftpic_machine_configs mc on mc.machine_id = ms.machine_id
      where mc.park_id = park_record.id
        and mc.is_active = true;

      v_heartbeat_minutes_since := null;
      if v_last_heartbeat_at is not null then
        v_heartbeat_minutes_since := extract(epoch from (now() - v_last_heartbeat_at)) / 60;
      end if;

      select * into v_alert_row from public.park_inactivity_alerts where park_id = park_record.id;

      -- ---------- RECOVERY ----------
      -- Offener Alarm + Park sieht wieder gesund aus -> Entwarnung + Zeile weg.
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
          -- Für den Rest dieses Durchlaufs so behandeln, als gäbe es keinen
          -- Alarm mehr (Neu-Select liefert jetzt keine Zeile -> park_id null).
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

      -- Verbindungsalarm NUR mit Live-Beleg: Herzschlag stale UND heute noch
      -- kein einziges Foto. Kommen Fotos, erreicht uns der Agent - dann ist es
      -- kein Verbindungsabriss.
      v_is_connection_alert :=
        v_heartbeat_minutes_since is not null
        and v_heartbeat_minutes_since >= v_heartbeat_stale_minutes
        and v_last_photo_at is null;

      v_effective_last_at := coalesce(v_last_photo_at, v_opening_at);
      v_minutes_since := extract(epoch from (now() - v_effective_last_at)) / 60;

      if not v_is_connection_alert and v_minutes_since < v_threshold_minutes then
        continue;
      end if;

      -- Schon gemeldet und kein neueres Foto seither -> nur alle 24 h eine
      -- Sicherheits-Wiederholung.
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
