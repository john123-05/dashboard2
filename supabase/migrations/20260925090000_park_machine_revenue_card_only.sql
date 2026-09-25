/*
  # park_machine_revenue: Betrag für Karte-only-Automaten

  Ein Automat mit settings.card_only = true (Imst "Automat neu", pcneu2)
  bekommt von der Kiosk-Software keinen Betrag je Zeile: Statistic.txt führt
  keinen Preis, und ohne zugeordneten hobex-Beleg bleibt amount_cents leer.
  Die Umsatz-Seite zeigte deshalb 0,00 EUR.

  Für solche Automaten rechnet die Funktion jetzt pro Kauf den Parkpreis
  (parks.price_per_photo_cents, Fallback 500 Cent), solange amount_cents leer
  ist. Ein echter Betrag aus einem Kartenbeleg hat weiter Vorrang. Alle
  anderen Automaten rechnen unverändert.

  Signatur und Rückgabespalten bleiben gleich.
*/
create or replace function public.park_machine_revenue(p_park_id uuid)
returns table (
  machine_id            text,
  heute_anzahl          bigint,
  heute_cent            bigint,
  woche_anzahl          bigint,
  woche_cent            bigint,
  monat_anzahl          bigint,
  monat_cent            bigint,
  gesamt_anzahl         bigint,
  gesamt_cent           bigint,
  karte_anzahl          bigint,
  bar_anzahl            bigint,
  unbekannt_anzahl      bigint
)
language sql
stable
set search_path = public
as $$
  with tz as (select (now() at time zone 'Europe/Vienna') as jetzt_local),
  preis as (
    select coalesce(
      (select p.price_per_photo_cents from public.parks p where p.id = p_park_id), 500
    )::integer as cent
  ),
  card_only as (
    select c.machine_id
    from public.liftpic_machine_configs c
    where c.park_id = p_park_id
      and coalesce((c.settings ->> 'card_only')::boolean, false)
  ),
  kaeufe as (
    select
      msp.machine_id,
      msp.sold_local,
      msp.sold_at,
      msp.method,
      case
        when msp.machine_id in (select machine_id from card_only)
          then coalesce(msp.amount_cents, (select cent from preis))
        else msp.amount_cents
      end as betrag
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
$$;
