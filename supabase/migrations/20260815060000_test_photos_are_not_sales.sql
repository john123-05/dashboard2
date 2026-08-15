-- Testfotos sichtbar machen, ohne sie als Verkauf zu zaehlen.
--
-- Anlass: aus dem Dashboard laesst sich ein Testfoto ausloesen, um zu pruefen,
-- ob Kamera und Kette arbeiten. Es soll auf der Fotos-Seite erscheinen wie
-- jedes andere Bild - aber in keiner Umsatzzahl auftauchen.
--
-- Am Automaten wird es unter .../testfoto/... abgelegt. `liftpic-ingest-begin`
-- setzt dieses Segment, wenn `metadata.is_test` gesetzt ist; ohne das Kennzeichen
-- entsteht exakt derselbe Pfad wie zuvor.
--
-- WICHTIG: Es gibt ZWEI Schreiber auf park_photo_sales_daily. Beide muessen
-- Testfotos ueberspringen:
--   * rollup_kiosk_photo_sale()   - zaehlt sofort beim Einfuegen eines Fotos
--   * resync_recent_photo_sales() - rechnet die letzten Tage neu
-- Beim ersten Versuch war nur der zweite abgesichert, und ein Testfoto landete
-- trotzdem im Tagesumsatz.

alter table public.photos
  add column if not exists is_test boolean not null default false;

comment on column public.photos.is_test is
  'Vom Dashboard ausgeloestes Testfoto. Sichtbar wie ein normales Foto, zaehlt '
  'aber in keiner Umsatzberechnung.';


-- 1) Beim Anlegen erkennen -------------------------------------------------
create or replace function public.handle_new_storage_object()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
  v_prefix text;
  v_customer_code text;
  v_park_id uuid;
  v_candidate_count integer;
  v_attraction_id uuid;
  v_external_code text;
  v_is_test boolean;
BEGIN
  -- Automaten-Betriebsmittel (Overlays, Logos) sind keine Gaestefotos.
  IF NEW.name LIKE 'liftpic-assets/%' THEN
    RETURN NEW;
  END IF;

  -- Testfotos liegen unter <praefix>/testfoto/... Das erste Pfadsegment bleibt
  -- unveraendert, die Parkzuordnung unten funktioniert also weiter wie bisher.
  v_is_test := NEW.name LIKE '%/testfoto/%';

  v_prefix := public.path_prefix(NEW.name);
  v_customer_code := public.parse_source_customer_code(NEW.name);
  v_external_code := NULLIF(
    regexp_replace(regexp_replace(COALESCE(NEW.name, ''), '^.*/', ''), '\.[^.]+$', ''),
    ''
  );

  IF v_external_code ~ '^[0-9]{20}$' THEN
    v_external_code := left(v_external_code, 16);
  ELSIF v_external_code ~ '^[0-9]{16}[_-].*$' THEN
    v_external_code := substring(v_external_code FROM '^([0-9]{16})');
  END IF;

  IF v_external_code !~ '^[0-9]{16}$' THEN
    v_external_code := NULL;
  END IF;

  IF v_prefix IS NOT NULL THEN
    SELECT ppp.park_id INTO v_park_id
    FROM public.park_path_prefixes ppp
    WHERE ppp.path_prefix = v_prefix AND ppp.is_active = true
    LIMIT 1;
  END IF;

  IF v_park_id IS NULL AND v_customer_code IS NOT NULL THEN
    SELECT COUNT(DISTINCT pc.park_id), MIN(pc.park_id::text)::uuid
    INTO v_candidate_count, v_park_id
    FROM public.park_cameras pc
    WHERE pc.customer_code = v_customer_code AND pc.is_active = true;

    IF COALESCE(v_candidate_count, 0) <> 1 THEN
      v_park_id := NULL;
    END IF;
  END IF;

  IF v_park_id IS NULL THEN
    SELECT COUNT(DISTINCT psb.park_id), MIN(psb.park_id::text)::uuid
    INTO v_candidate_count, v_park_id
    FROM public.park_storage_buckets psb
    WHERE psb.bucket_id = NEW.bucket_id;

    IF COALESCE(v_candidate_count, 0) <> 1 THEN
      v_park_id := '11111111-1111-1111-1111-111111111111'::uuid;
    END IF;
  END IF;

  IF v_park_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pc.attraction_id INTO v_attraction_id
  FROM public.park_cameras pc
  WHERE pc.park_id = v_park_id
    AND pc.customer_code = v_customer_code
    AND pc.is_active = true
  LIMIT 1;

  INSERT INTO public.photos (
    storage_bucket, storage_path, captured_at, speed_kmh,
    source_customer_code, source_time_code, source_file_code, source_speed_kmh,
    camera_code, attraction_id, park_id, external_code, is_test, created_at
  )
  VALUES (
    NEW.bucket_id, NEW.name, NEW.created_at, public.parse_speed_kmh(NEW.name),
    v_customer_code, public.parse_source_time_code(NEW.name),
    public.parse_source_file_code(NEW.name), public.parse_speed_kmh(NEW.name),
    v_customer_code, v_attraction_id, v_park_id, v_external_code, v_is_test, now()
  )
  ON CONFLICT (park_id, storage_bucket, storage_path)
  DO UPDATE SET external_code = COALESCE(public.photos.external_code, EXCLUDED.external_code);

  RETURN NEW;
END;
$function$;


-- 2) Sofortzaehler beim Einfuegen -----------------------------------------
create or replace function public.rollup_kiosk_photo_sale()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_price_cents integer;
  v_tz text;
  v_business_date date;
  v_file_code integer;
begin
  -- Ein Testfoto ist kein Verkauf.
  if NEW.is_test then return NEW; end if;

  begin
    select price_per_photo_cents, timezone into v_price_cents, v_tz
    from public.parks where id = NEW.park_id;
    if v_price_cents is null then return NEW; end if;

    v_business_date := null;
    if NEW.source_time_code ~ '^[0-9]{8}$' then
      begin
        v_business_date := to_date(NEW.source_time_code, 'DDMMYYYY');
      exception when others then
        v_business_date := null;
      end;
    end if;
    if v_business_date is null then
      v_business_date := (coalesce(NEW.captured_at, NEW.created_at)
        at time zone coalesce(v_tz, 'Europe/Vienna'))::date;
    end if;

    v_file_code := case when NEW.source_file_code ~ '^[0-9]+$'
                        then NEW.source_file_code::integer else null end;

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
$function$;


-- 3) Neuberechnung der letzten Tage ---------------------------------------
create or replace function public.resync_recent_photo_sales()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.park_photo_sales_daily as t (park_id, camera_code, business_date, photos_sold_count)
  select park_id, camera_code, business_date, sold from (
    select ph.park_id, coalesce(ph.camera_code, 'unknown') as camera_code,
      coalesce(
        case when ph.source_time_code ~ '^(0[1-9]|[12][0-9]|3[01])(0[1-9]|1[0-2])[0-9]{4}$'
             then to_date(ph.source_time_code, 'DDMMYYYY') end,
        (coalesce(ph.captured_at, ph.created_at) at time zone coalesce(pk.timezone, 'Europe/Vienna'))::date
      ) as business_date,
      count(*) as sold
    from public.photos ph
    join public.parks pk on pk.id = ph.park_id and pk.price_per_photo_cents is not null
    where ph.is_test = false
    group by 1, 2, 3
  ) x
  where business_date >= (current_date - interval '10 days')
  on conflict (park_id, camera_code, business_date) do update
    set photos_sold_count = greatest(t.photos_sold_count, excluded.photos_sold_count), updated_at = now();
end;
$function$;
