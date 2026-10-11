-- Demo Park: Beispieldaten und „lebende“ Zahlen (docs/AUSBAU_PLAN.md, DM3). Shared-Projekt kvpcwlcfgmsmarjtwpsx.
--
-- Alles hier schreibt NUR in den Park mit dem Slug 'demo-park'. Es gibt drei Funktionen:
--   demo_park_day(d)   – feste Tageswerte (Fahrten, Verkäufe) aus dem Datum errechnet, damit jeder Lauf dasselbe ergibt
--   demo_park_seed()   – legt Verlauf, Fotos, Käufe, Kontakte, Umfragen, Bestenliste, Kampagne, Automat an (wiederholbar)
--   demo_park_tick()   – alle 10 Minuten (pg_cron): zählt den heutigen Tag weiter und hält den Demo-Automaten „online“
--
-- Wichtig:
-- - Die Bilder liegen als Kopien unter storage `test/processed/demo-park/demo-01.jpg … demo-24.jpg`
--   (Mischung aus Imst, Plose, Tarzans, Grünberg – von John so gewünscht, 11.10.2026).
-- - Namen und E-Mail-Adressen sind erfunden (@example.com). Es gehen keine Mails raus: der Park hat keine Automation.
-- - Der Park hat bewusst KEINE Öffnungszeiten: `check_park_inactivity()` überspringt ihn dann (kein Alarm an Staff).
-- - Rückbau: `select public.demo_park_wipe();` und den cron-Job `demo-park-tick` entfernen.

create or replace function public.demo_park_id() returns uuid language sql stable as $$
  select id from public.parks where slug = 'demo-park'
$$;

create or replace function public.demo_park_day(d date)
returns table (rides int, sold int) language sql immutable as $$
  select r, greatest(3, round(r * (0.068 + (abs(hashtext('c' || d::text)) % 45) / 1000.0))::int)
  from (
    select greatest(40, (
      (case extract(isodow from d)::int when 6 then 1150 when 7 then 1250 when 5 then 900 else 700 end)
      * (0.75 + (abs(hashtext('r' || d::text)) % 50) / 100.0)
      * (case when extract(month from d) in (7, 8) then 1.15 when extract(month from d) in (11, 12, 1, 2, 3) then 0.55 else 0.9 end)
      * (case when abs(hashtext('w' || d::text)) % 12 = 0 then 0.35 else 1 end)   -- ab und zu ein Regentag
    )::int) as r
  ) x
$$;

-- Anteil des Tages, der um diese Uhrzeit (Ortszeit) schon gelaufen ist: 09:00 = 0, 17:00 = 1, mittags am steilsten.
create or replace function public.demo_park_progress(t time) returns numeric language sql immutable as $$
  select case when x <= 0 then 0 when x >= 1 then 1 else round((x * x * (3 - 2 * x))::numeric, 4) end
  from (select (extract(epoch from t) - 9 * 3600) / (8 * 3600.0) as x) s
$$;

create or replace function public.demo_park_wipe() returns void language plpgsql security definer set search_path to 'public' as $$
declare p uuid := public.demo_park_id();
begin
  if p is null then return; end if;
  delete from park_share_links where park_id = p;
  delete from park_speed_results where park_id = p;
  delete from park_guest_profiles where park_id = p;
  delete from photo_claims where park_id = p;
  delete from park_survey_responses where park_id = p;
  delete from park_survey_questions where park_id = p;
  delete from park_survey_settings where park_id = p;
  delete from park_social_entries where park_id = p;
  delete from park_social_campaigns where park_id = p;
  delete from park_email_campaigns where park_id = p;
  delete from park_email_settings where park_id = p;
  delete from park_equipment_items where park_id = p;
  delete from machine_sale_payments where park_id = p;
  delete from machine_ride_snapshots where park_id = p;
  delete from machine_status where park_id = p;
  delete from liftpic_machine_configs where park_id = p;
  delete from park_photo_ride_daily where park_id = p;
  delete from park_photo_sales_daily where park_id = p;
  delete from photos where park_id = p;
end;
$$;

create or replace function public.demo_park_seed() returns text language plpgsql security definer set search_path to 'public' as $$
declare
  p uuid := public.demo_park_id();
  tz constant text := 'Europe/Vienna';
  att uuid;
  q_nps uuid := md5('demo-q-nps')::uuid;
  q_txt uuid := md5('demo-q-text')::uuid;
  camp uuid := md5('demo-campaign-1')::uuid;
  ls jsonb;
  first_names text[] := array['Anna','Lukas','Sophie','Jonas','Mia','Felix','Laura','Paul','Emma','Noah','Lena','Elias','Marie','Ben','Clara','Leon','Giulia','Marco','Sanne','Daan','Chloé','Hugo','Olivia','James','Elena','Tobias','Nina','David','Sara','Simon'];
  last_names text[] := array['Huber','Gruber','Bauer','Wagner','Pichler','Moser','Mayer','Hofer','Leitner','Berger','Fuchs','Eder','Fischer','Schmid','Winkler','Rossi','Bianchi','de Vries','Jansen','Martin','Dubois','Smith','Taylor','Müller','Schneider','Keller','Weber','Maier','Steiner','Lang'];
  locales text[] := array['de','de','de','de','en','en','it','nl','fr','de'];
  countries text[] := array['AT','DE','DE','CH','GB','US','IT','NL','FR','AT'];
  good text[] := array['Super Fahrt, tolle Fotos!','Hat richtig Spaß gemacht.','Great ride, loved the photo.','Bellissimo, torneremo!','Erg leuk, mooie foto.','Top, gerne wieder.','Sehr freundliches Personal.','Die Kinder waren begeistert.','Amazing views.','Schnell und unkompliziert.'];
  meh text[] := array['Wartezeit war etwas lang.','Foto etwas dunkel.','Could be a bit cheaper.','War okay.','Mehr Schatten beim Anstehen wäre gut.'];
  racers text[] := array['Rodelracer98','Speedy_Lena','xX_TirolBlitz_Xx','BobKönig','TurboTom','Kurvenkratzer','AlpenRakete','FlitzeFelix','Miss_Vollgas','Bergpilot','NoBrakesNina','DownhillDave','SchussFahrer','Gipfelstürmerin','RasenderRoland','KufenKati','Vollgas_Vroni','Eisblitz','TalwärtsTim','PistenPaula'];
  d date;
  i int;
  n int;
  r record;
begin
  if p is null then return 'Demo Park fehlt'; end if;
  perform public.demo_park_wipe();
  select id into att from attractions where park_id = p order by created_at limit 1;

  -- 1) Verlauf: 180 Tage Verkäufe (dauerhafte Tageswerte) und Fahrten
  insert into park_photo_sales_daily (park_id, camera_code, business_date, photos_sold_count)
  select p, 'demo1', g::date, (public.demo_park_day(g::date)).sold
  from generate_series(current_date - 180, current_date - 1, interval '1 day') g;

  insert into park_photo_ride_daily (park_id, park_slug, machine_id, camera_code, business_date, photos_taken_count, photos_sold_count,
                                     conversion_rate, first_capture_at, last_capture_at, last_sale_at, speed_ok_count, last_seen_at, payload)
  select p, 'demo-park', 'demo-automat', 'demo1', g::date, x.rides, x.sold, round(x.sold::numeric / x.rides, 3),
         (g::date + time '09:00') at time zone tz, (g::date + time '17:00') at time zone tz, (g::date + time '16:48') at time zone tz,
         x.rides, (g::date + time '17:05') at time zone tz, '{}'::jsonb
  from generate_series(current_date - 180, current_date - 1, interval '1 day') g, lateral public.demo_park_day(g::date) x;

  -- 2) Einzelne Käufe der letzten 12 Tage (Seite „Käufe“, Bar/Karte)
  insert into machine_sale_payments (park_id, machine_id, sold_at, sold_local, bild_nr, print_count, method, method_source, amount_cents, card_scheme, receipt_no, source_file)
  select p, 'demo-automat',
         (g::date + time '09:00' + make_interval(secs => ((s - 0.5) / x.sold) * 8 * 3600)) at time zone tz,
         g::date + time '09:00' + make_interval(secs => ((s - 0.5) / x.sold) * 8 * 3600),
         (70000 + (g::date - current_date) * 200 + s)::text, 3,
         case when abs(hashtext('m' || g::text || s::text)) % 100 < 14 then 'bar' else 'karte' end, 'automat_flag', 500,
         case when abs(hashtext('m' || g::text || s::text)) % 100 < 14 then null
              else (array['VISA','MASTERCARD','MASTERCARD','MAESTRO','V PAY'])[1 + abs(hashtext('k' || g::text || s::text)) % 5] end,
         'D' || lpad(((g::date - date '2026-01-01') * 1000 + s)::text, 7, '0'), 'demo'
  from generate_series(current_date - 12, current_date - 1, interval '1 day') g, lateral public.demo_park_day(g::date) x, generate_series(1, x.sold) s;

  -- 3) Halbstündliche Zählerstände der letzten 3 Tage (Stoßzeiten)
  insert into machine_ride_snapshots (park_id, machine_id, business_date, captured_at, rides_today, photos_sold_today, paper_printed)
  select p, 'demo-automat', g::date, (g::date + t::time) at time zone tz,
         round(x.rides * public.demo_park_progress(t::time))::int, round(x.sold * public.demo_park_progress(t::time))::int, 300
  from generate_series(current_date - 3, current_date - 1, interval '1 day') g, lateral public.demo_park_day(g::date) x,
       generate_series(timestamp '2000-01-01 09:00', timestamp '2000-01-01 17:00', interval '30 minutes') t;

  -- … und für heute bis jetzt (danach schreibt der Tick alle 10 Minuten weiter)
  insert into machine_ride_snapshots (park_id, machine_id, business_date, captured_at, rides_today, photos_sold_today, paper_printed)
  select p, 'demo-automat', current_date, (current_date + t::time) at time zone tz,
         round(x.rides * public.demo_park_progress(t::time))::int, round(x.sold * public.demo_park_progress(t::time))::int, 300
  from public.demo_park_day(current_date) x,
       generate_series(timestamp '2000-01-01 09:00', timestamp '2000-01-01 17:00', interval '30 minutes') t
  where (current_date + t::time) at time zone tz < now();

  -- 4) Fotos (Kopien im Speicher), verteilt auf die letzten 6 Tage inkl. heute
  insert into photos (id, park_id, storage_bucket, storage_path, captured_at, speed_kmh, price_cents, currency, is_paid, is_test, attraction_id, camera_code, external_code)
  select md5('demo-photo-' || s)::uuid, p, 'test', 'processed/demo-park/demo-' || lpad(s::text, 2, '0') || '.jpg',
         ((current_date - ((s - 1) % 6)) + time '10:05' + make_interval(mins => s * 13)) at time zone tz,
         round((19 + (abs(hashtext('v' || s::text)) % 240) / 10.0)::numeric, 1), 500, 'eur', false, false, att, 'demo-foto', '90000000000000' || lpad(s::text, 2, '0')   -- 16 Ziffern: so findet die Abholseite das Foto (find_claim_photo)
  from generate_series(1, 24) s;

  -- 5) Umfrage: Einstellungen, zwei Fragen
  insert into park_survey_settings (park_id, mode, email_mode, phone_mode, address_mode, review_min_score, review_url)
  values (p, 'survey', 'required', 'off', 'off', 9, 'https://www.google.com/maps')
  on conflict (park_id) do nothing;
  insert into park_survey_questions (id, park_id, position, type, prompt, options, required, is_score_question, active) values
    (q_nps, p, 0, 'nps', '{"de":"Wie wahrscheinlich ist es, dass du uns weiterempfiehlst?","en":"How likely are you to recommend us to a friend?"}', '[]', true, true, true),
    (q_txt, p, 1, 'text', '{"de":"Was hat dir besonders gefallen oder was können wir besser machen?","en":"What did you like most, or what could we do better?"}', '[]', true, false, true);

  -- 6) Kontakte der letzten 75 Tage, jeder mit Umfrage-Antwort (erfundene Namen, @example.com)
  for d in select g::date from generate_series(current_date - 75, current_date, interval '1 day') g loop
    n := 3 + abs(hashtext('n' || d::text)) % 6;
    for i in 1..n loop
      declare
        h int := abs(hashtext('p' || d::text || i::text));
        fn text := first_names[1 + h % array_length(first_names, 1)];
        ln text := last_names[1 + (h / 7) % array_length(last_names, 1)];
        loc int := 1 + (h / 3) % array_length(locales, 1);
        score int := case when h % 100 < 58 then 10 when h % 100 < 78 then 9 when h % 100 < 90 then 8 when h % 100 < 96 then 7 else 3 + h % 4 end;
        resp uuid := md5('demo-resp-' || d::text || i::text)::uuid;
        photo uuid := md5('demo-photo-' || (1 + (h % 24)))::uuid;
        at_ts timestamptz := (d + time '10:00' + make_interval(mins => (h % 400))) at time zone tz;
      begin
        if d = current_date and at_ts > now() then continue; end if;
        insert into park_survey_responses (id, park_id, photo_id, answers, score, locale, country_code, review_link_shown, submitted_at)
        values (resp, p, photo,
                jsonb_build_object(q_nps::text, score, q_txt::text, case when score >= 8 then good[1 + h % array_length(good, 1)] else meh[1 + h % array_length(meh, 1)] end),
                score, locales[loc], countries[loc], score >= 9, at_ts);
        insert into photo_claims (park_id, photo_id, claim_code, full_name, email, status, access_token, marketing_opt_in, claimed_at, created_at, locale, country_code, survey_response_id)
        values (p, photo, 'DEMO' || to_char(d, 'YYMMDD') || lpad(i::text, 2, '0'), fn || ' ' || ln,
                lower(replace(fn, 'é', 'e') || '.' || replace(replace(replace(ln, ' ', ''), 'ü', 'ue'), 'ö', 'oe')) || (10 + h % 89) || '@example.com',
                'claimed', md5('demo-tok-a' || d::text || i::text) || md5('demo-tok-b' || d::text || i::text), h % 100 < 38, at_ts, at_ts, locales[loc], countries[loc], resp);
      end;
    end loop;
  end loop;

  -- 7) Bestenliste: Fahrer mit Spitznamen, Ergebnisse der letzten 30 Tage (heute zählt der Tick weiter)
  insert into park_guest_profiles (park_id, email, display_name)
  select p, 'racer' || s || '@example.com', racers[s] from generate_series(1, array_length(racers, 1)) s
  on conflict do nothing;
  insert into park_speed_results (park_id, photo_id, email, speed_kmh, captured_at, day)
  select p, md5('demo-speed-' || g::text || s::text)::uuid, 'racer' || (1 + abs(hashtext('e' || g::text || s::text)) % 20) || '@example.com',
         round((24 + (abs(hashtext('s' || g::text || s::text)) % 200) / 10.0)::numeric, 1),
         (g::date + time '09:30' + make_interval(mins => s * 37)) at time zone tz, g::date
  from generate_series(current_date - 30, current_date - 1, interval '1 day') g, generate_series(1, 9) s
  on conflict do nothing;

  -- 8) Social Media: ein laufendes Gewinnspiel mit Teilnehmern
  insert into park_social_campaigns (id, park_id, name, type, status, hashtag, mention, prize, rules_text, starts_at, ends_at)
  values (camp, p, 'Sommer-Gewinnspiel', 'giveaway', 'active', '#DemoCoaster', '@demopark', 'Saisonkarte für zwei',
          jsonb_build_object('de', 'Teilnahme ab 16 Jahren. Die Gewinnerin oder der Gewinner wird per E-Mail benachrichtigt. Keine Barauszahlung.',
                             'en', 'Participants must be 16 or older. The winner will be notified by email. No cash alternative.'),
          now() - interval '20 days', now() + interval '40 days');
  insert into park_social_entries (park_id, photo_id, name, email, giveaway_opt_in, platform, handle, post_url, posted_at, locale, country_code, created_at, campaign_id, verified_at, verified_by, photo_rights)
  select p, md5('demo-photo-' || s)::uuid, first_names[s] || ' ' || last_names[s + 3], lower(first_names[s]) || '.social' || s || '@example.com', true, 'instagram',
         '@' || lower(first_names[s]) || '_' || (1990 + s), 'https://www.instagram.com/', now() - make_interval(days => s), locales[1 + s % 10], countries[1 + s % 10],
         now() - make_interval(days => s), camp, case when s % 3 <> 0 then now() - make_interval(days => s - 1) end, case when s % 3 <> 0 then 'manual' end, s % 2 = 0
  from generate_series(1, 16) s;
  insert into park_share_links (token, park_id, claim_id, campaign_id, visits, unique_visitors)
  select md5('demo-share-' || c.id::text), p, c.id, camp, 4 + abs(hashtext(c.id::text)) % 40, 2 + abs(hashtext(c.id::text)) % 20
  from (select id from photo_claims where park_id = p order by claimed_at desc limit 12) c;

  -- 9) E-Mail-Marketing: Absender und eine versendete Kampagne
  insert into park_email_settings (park_id, sender_name, reply_to, footer_address)
  values (p, 'Demo Park', 'info@example.com', 'Demo Park · Musterweg 1 · 6460 Imst');
  insert into park_email_campaigns (park_id, name, subject, preheader, language, html, segment, status, sent_at, recipients, opened, clicked)
  values (p, 'Saisonstart 2026', 'Wir sind zurück – der Coaster fährt wieder!', 'Ab 1. Mai geht es los. Mit 10 % auf dein nächstes Foto.', 'de',
          '<p>Hallo! Ab dem 1. Mai fährt der Demo Coaster wieder. Mit dem Code START10 bekommst du 10 % auf dein nächstes Foto.</p>', '{}'::jsonb, 'sent', now() - interval '18 days', 148, 67, 21);

  -- 10) Dein Fotosystem: Ausstattung und Empfehlungen wie bei einem echten Park
  insert into park_equipment_items (park_id, kategorie, titel, beschreibung, status, geschaetzter_mehrumsatz_cents, sortierung, image_url, before_image_url, after_image_url, mehrwert_text, preview_url)
  select p, kategorie, titel, beschreibung, status, geschaetzter_mehrumsatz_cents, sortierung, image_url, before_image_url, after_image_url, mehrwert_text, preview_url
  from park_equipment_items where park_id = (select id from parks where slug = 'imster-bergbahnen');

  -- 11) Demo-Automat: Zustand von einem echten Automaten abgeleitet, alles auf „läuft“, ohne Zahlungs- und Kundendaten
  select last_status into ls from liftpic_machine_configs where machine_id = 'pcneu2' limit 1;
  if ls is not null then
    ls := (ls - 'sale_payments' - 'operational_events' - 'statistic_last_line' - 'ride_rollups' - 'ride_counts' - 'payments' - 'coin_warnings' - 'coin_payout_failures')
      || jsonb_build_object(
        'park_id', p, 'park_slug', 'demo-park', 'machine_id', 'demo-automat', 'camera_code', 'demo1', 'customer_code', 'DEMO',
        'faults_now', 0, 'warnings_now', 0, 'coin_status', 'ok', 'paper_status', 'ok', 'paper_remaining', 412, 'paper_printed', 338,
        'queue_count', 0, 'pending_health_events', 0, 'sale_payments', '[]'::jsonb, 'operational_events', '[]'::jsonb, 'ride_rollups', '[]'::jsonb,
        'ride_counts', '{}'::jsonb, 'can_test_photo', false,
        'operational_devices', coalesce((select jsonb_agg((e - 'source_file') || jsonb_build_object('status', 'operational', 'severity', 'info', 'detail', 'Läuft', 'plain', '', 'idle_minutes', 0))
                                         from jsonb_array_elements(ls -> 'operational_devices') e), '[]'::jsonb),
        'probes', coalesce((select jsonb_agg(e || jsonb_build_object('status', 'ok', 'detail', 'Läuft', 'since_minutes', 480))
                            from jsonb_array_elements(ls -> 'probes') e), '[]'::jsonb));
    if ls -> 'camera_settings' is not null and jsonb_typeof(ls -> 'camera_settings') = 'object' then
      ls := jsonb_set(ls, '{camera_settings,seriennummer}', '"DEMO0001"');
    end if;
  else
    ls := jsonb_build_object('park_id', p, 'machine_id', 'demo-automat', 'faults_now', 0, 'warnings_now', 0, 'paper_status', 'ok', 'paper_remaining', 412);
  end if;
  insert into liftpic_machine_configs (park_id, attraction_id, machine_id, machine_label, camera_code, camera_label, legacy_customer_code, mode, qr_enabled, speed_enabled,
                                       count_rides_enabled, upload_all_photos, shadow_mode, paper_warn_remaining, pairing_status, last_seen_at, last_status, settings, is_active, paper_capacity)
  values (p, att, 'demo-automat', 'Demo-Automat', 'demo1', 'Demo-Automat', 'DEMO', 'sold_only', true, true, true, false, false, 30, 'paired', now(), ls, '{}'::jsonb, true, 750);
  insert into machine_status (machine_id, park_id, park_slug, last_seen_at, queue_count, disk_free_mb, paper_status, paper_remaining, camera_code, photos_taken_today, photos_sold_today, payload)
  values ('demo-automat', p, 'demo-park', now(), 0, 412000, 'ok', 412, 'demo1', 0, 0, '{}'::jsonb)
  on conflict (machine_id) do update set last_seen_at = now();

  -- 12) Online-Shop: Einstellungen mit festem Vorschau-Link (die Demo-Gästeseite verlinkt darauf)
  insert into park_shop_settings (park_id, accent_color, shop_name, welcome_text, demo_token)
  values (p, '#E8722A', 'Demo Park Foto-Shop', 'Hol dir dein Foto vom Demo Coaster – als Download, Abzug oder auf Tasse, T-Shirt und mehr.', md5('demo-park-shop')::uuid)
  on conflict (park_id) do nothing;

  perform public.demo_park_tick();
  return 'ok';
end;
$$;

-- Zählt den heutigen Tag weiter und hält den Demo-Automaten online. Läuft alle 10 Minuten.
create or replace function public.demo_park_tick() returns void language plpgsql security definer set search_path to 'public' as $$
declare
  p uuid := public.demo_park_id();
  tz constant text := 'Europe/Vienna';
  today date := (now() at time zone tz)::date;
  prog numeric := public.demo_park_progress((now() at time zone tz)::time);
  x record;
  rides_now int;
  sold_now int;
  have int;
  s int;
begin
  if p is null or not exists (select 1 from liftpic_machine_configs where park_id = p) then return; end if;
  select * into x from public.demo_park_day(today);
  rides_now := round(x.rides * prog)::int;
  sold_now := round(x.sold * prog)::int;

  insert into park_photo_sales_daily (park_id, camera_code, business_date, photos_sold_count)
  values (p, 'demo1', today, sold_now)
  on conflict (park_id, camera_code, business_date) do update set photos_sold_count = excluded.photos_sold_count, updated_at = now();

  insert into park_photo_ride_daily (park_id, park_slug, machine_id, camera_code, business_date, photos_taken_count, photos_sold_count, conversion_rate,
                                     first_capture_at, last_capture_at, last_sale_at, speed_ok_count, last_seen_at, payload)
  values (p, 'demo-park', 'demo-automat', 'demo1', today, rides_now, sold_now, case when rides_now > 0 then round(sold_now::numeric / rides_now, 3) end,
          (today + time '09:00') at time zone tz, now(), now(), rides_now, now(), '{}'::jsonb)
  on conflict (machine_id, camera_code, business_date) do update
    set photos_taken_count = excluded.photos_taken_count, photos_sold_count = excluded.photos_sold_count, conversion_rate = excluded.conversion_rate,
        last_capture_at = excluded.last_capture_at, last_sale_at = excluded.last_sale_at, speed_ok_count = excluded.speed_ok_count, last_seen_at = now();

  -- Einzelkäufe von heute bis zum aktuellen Stand auffüllen
  select count(*) into have from machine_sale_payments where park_id = p and sold_local::date = today;
  if sold_now > have then
    for s in (have + 1)..sold_now loop
      insert into machine_sale_payments (park_id, machine_id, sold_at, sold_local, bild_nr, print_count, method, method_source, amount_cents, card_scheme, receipt_no, source_file)
      values (p, 'demo-automat',
              least(now(), (today + time '09:00' + make_interval(secs => ((s - 0.5) / greatest(x.sold, 1)) * 8 * 3600)) at time zone tz),
              least((now() at time zone tz), today + time '09:00' + make_interval(secs => ((s - 0.5) / greatest(x.sold, 1)) * 8 * 3600)),
              (70000 + s)::text, 3,
              case when abs(hashtext('m' || today::text || s::text)) % 100 < 14 then 'bar' else 'karte' end, 'automat_flag', 500,
              case when abs(hashtext('m' || today::text || s::text)) % 100 < 14 then null
                   else (array['VISA','MASTERCARD','MASTERCARD','MAESTRO','V PAY'])[1 + abs(hashtext('k' || today::text || s::text)) % 5] end,
              'D' || lpad(((today - date '2026-01-01') * 1000 + s)::text, 7, '0'), 'demo');
    end loop;
  end if;

  insert into machine_ride_snapshots (park_id, machine_id, business_date, captured_at, rides_today, photos_sold_today, paper_printed)
  values (p, 'demo-automat', today, now(), rides_now, sold_now, 338 + sold_now);

  -- Bestenliste: über den Tag bis zu 9 Fahrten
  insert into park_speed_results (park_id, photo_id, email, speed_kmh, captured_at, day)
  select p, md5('demo-speed-' || today::text || g::text)::uuid, 'racer' || (1 + abs(hashtext('e' || today::text || g::text)) % 20) || '@example.com',
         round((24 + (abs(hashtext('s' || today::text || g::text)) % 200) / 10.0)::numeric, 1), now(), today
  from generate_series(1, greatest(0, round(9 * prog)::int)) g
  on conflict do nothing;

  -- Fotos einmal am Tag auf „die letzten 6 Tage“ nachziehen, damit heute immer welche da sind
  update photos set captured_at = captured_at + interval '1 day'
   where park_id = p and (select max((captured_at at time zone tz)::date) from photos where park_id = p) < today;

  -- Automat „online“ halten
  update liftpic_machine_configs
     set last_seen_at = now(),
         last_status = last_status || jsonb_build_object('photos_sold_today', sold_now, 'photos_taken_today', rides_now,
                         'photo_conversion_today', case when rides_now > 0 then round(sold_now::numeric / rides_now, 3) else 0 end,
                         'paper_remaining', 412 - sold_now, 'paper_printed', 338 + sold_now)
   where park_id = p;
  update machine_status set last_seen_at = now(), photos_taken_today = rides_now, photos_sold_today = sold_now, paper_remaining = 412 - sold_now where park_id = p;
end;
$$;

revoke all on function public.demo_park_seed(), public.demo_park_tick(), public.demo_park_wipe() from public, anon, authenticated;

-- Alle 10 Minuten weiterzählen (pg_cron). Wiederholbar: alten Job gleichen Namens vorher entfernen.
select cron.unschedule(jobid) from cron.job where jobname = 'demo-park-tick';
select cron.schedule('demo-park-tick', '*/10 * * * *', 'select public.demo_park_tick();');
