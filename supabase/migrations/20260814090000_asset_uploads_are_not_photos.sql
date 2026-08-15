/*
  Asset-Uploads duerfen keine Gaestefotos erzeugen

  Problem
  -------
  Auf storage.objects sitzt handle_new_storage_object(). Bei jedem Upload legt
  der Trigger eine photos-Zeile an und bestimmt den Park so:
    1. ueber das Pfad-Praefix (park_path_prefixes)
    2. ueber den customer_code im Dateinamen (park_cameras)
    3. sonst ueber park_storage_buckets -> dort ist Bucket `test` dem Park
       imster-bergbahnen zugeordnet

  Automaten-Dateien (Overlay, Logo, Hintergrund) liegen seit dem 14.08.2026
  unter dem Praefix `liftpic-assets/` im Bucket `test`, weil der eigentliche
  Bucket `liftpic-assets` seit der Umstellung auf die neuen API-Schluessel
  keine Uploads mehr annimmt. Sie durchlaufen daher Stufe 3 und landeten als
  Foto bei Imst - mit entsprechendem Phantom-Umsatz in der Auswertung.

  Aenderung
  ---------
  Ein Guard ganz am Anfang: Pfade unter `liftpic-assets/` sind Betriebsmittel,
  keine Gaestefotos, und werden uebersprungen. Der restliche Funktionskoerper
  ist unveraendert gegenueber dem produktiven Stand (Sicherung liegt in
  ROLLBACK_handle_new_storage_object_2026-08-14.sql).

  Echte Fotos sind nicht betroffen: deren Pfade sind entweder flach
  (`1632145419516010.jpg`) oder beginnen mit `processed/<park-slug>/...`.
*/

CREATE OR REPLACE FUNCTION public.handle_new_storage_object()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_prefix text;
  v_customer_code text;
  v_park_id uuid;
  v_candidate_count integer;
  v_attraction_id uuid;
  v_external_code text;
BEGIN
  -- NEU: Automaten-Betriebsmittel sind keine Gaestefotos.
  IF NEW.name LIKE 'liftpic-assets/%' THEN
    RETURN NEW;
  END IF;

  v_prefix := public.path_prefix(NEW.name);
  v_customer_code := public.parse_source_customer_code(NEW.name);
  v_external_code := NULLIF(
    regexp_replace(
      regexp_replace(COALESCE(NEW.name, ''), '^.*/', ''),
      '\.[^.]+$',
      ''
    ),
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
    SELECT ppp.park_id
    INTO v_park_id
    FROM public.park_path_prefixes ppp
    WHERE ppp.path_prefix = v_prefix
      AND ppp.is_active = true
    LIMIT 1;
  END IF;

  IF v_park_id IS NULL AND v_customer_code IS NOT NULL THEN
    SELECT COUNT(DISTINCT pc.park_id), MIN(pc.park_id::text)::uuid
    INTO v_candidate_count, v_park_id
    FROM public.park_cameras pc
    WHERE pc.customer_code = v_customer_code
      AND pc.is_active = true;

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

  SELECT pc.attraction_id
  INTO v_attraction_id
  FROM public.park_cameras pc
  WHERE pc.park_id = v_park_id
    AND pc.customer_code = v_customer_code
    AND pc.is_active = true
  LIMIT 1;

  INSERT INTO public.photos (
    storage_bucket,
    storage_path,
    captured_at,
    speed_kmh,
    source_customer_code,
    source_time_code,
    source_file_code,
    source_speed_kmh,
    camera_code,
    attraction_id,
    park_id,
    external_code,
    created_at
  )
  VALUES (
    NEW.bucket_id,
    NEW.name,
    NEW.created_at,
    public.parse_speed_kmh(NEW.name),
    v_customer_code,
    public.parse_source_time_code(NEW.name),
    public.parse_source_file_code(NEW.name),
    public.parse_speed_kmh(NEW.name),
    v_customer_code,
    v_attraction_id,
    v_park_id,
    v_external_code,
    now()
  )
  ON CONFLICT (park_id, storage_bucket, storage_path)
  DO UPDATE SET external_code = COALESCE(public.photos.external_code, EXCLUDED.external_code);

  RETURN NEW;
END;
$function$;
