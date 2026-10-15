-- Umsatz je Automat: fehlt der Betrag einer Zahlung (Automat meldet nur "verkauft", ohne Terminal-
-- oder Münzbetrag), zählt der Fotopreis des Parks. Vorher galt das nur für reine Karten-Automaten,
-- alle anderen zeigten 0 € trotz Verkäufen (Grünberg, Plose, Serles, Tarzans, Wingst am 15.10.2026).
-- "Heute" und "Monat" jetzt in der Zeitzone des Parks statt fest Europe/Vienna (Tarzans: Riga).
create or replace function public.park_machine_revenue(p_park_id uuid)
 returns table(machine_id text, heute_anzahl bigint, heute_cent bigint, woche_anzahl bigint, woche_cent bigint, monat_anzahl bigint, monat_cent bigint, gesamt_anzahl bigint, gesamt_cent bigint, karte_anzahl bigint, bar_anzahl bigint, unbekannt_anzahl bigint)
 language sql
 stable
 set search_path to 'public'
as $function$
  with park as (
    select coalesce(nullif(p.timezone, ''), 'Europe/Vienna') as tz,
           coalesce(p.price_per_photo_cents, 500)::integer as cent
    from public.parks p where p.id = p_park_id
  ),
  tz as (select (now() at time zone coalesce((select tz from park), 'Europe/Vienna')) as jetzt_local),
  kaeufe as (
    select
      msp.machine_id,
      msp.sold_local,
      msp.sold_at,
      msp.method,
      coalesce(msp.amount_cents, (select cent from park), 500) as betrag
    from public.machine_sale_payments msp
    where msp.park_id = p_park_id
  )
  select
    k.machine_id,
    count(*) filter (where k.sold_local::date = (select jetzt_local::date from tz)),
    coalesce(sum(k.betrag) filter (where k.sold_local::date = (select jetzt_local::date from tz)), 0),
    count(*) filter (where k.sold_at >= now() - interval '7 days'),
    coalesce(sum(k.betrag) filter (where k.sold_at >= now() - interval '7 days'), 0),
    count(*) filter (where date_trunc('month', k.sold_local) = date_trunc('month', (select jetzt_local from tz))),
    coalesce(sum(k.betrag) filter (where date_trunc('month', k.sold_local) = date_trunc('month', (select jetzt_local from tz))), 0),
    count(*),
    coalesce(sum(k.betrag), 0),
    count(*) filter (where k.method = 'karte'),
    count(*) filter (where k.method = 'bar'),
    count(*) filter (where k.method = 'unbekannt')
  from kaeufe k
  group by k.machine_id
$function$;
