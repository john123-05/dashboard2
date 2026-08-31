/*
  # park_machine_revenue(p_park_id) - Umsatz je Automat, für die Umsatz-Seite

  Liefert pro machine_id die Käufe-Anzahl und den Betrag für heute / letzte
  7 Tage / diesen Monat / gesamt, plus die Karte/Bar-Aufteilung gesamt. Quelle
  ist machine_sale_payments (dauerhaft, mit machine_id). Der Betrag ist der
  ermittelte Betrag je Kauf (Kartenbeleg bzw. Fixpreis), "unbekannt"-Käufe
  ohne Betrag zählen bei der Anzahl mit, nicht beim Geld.

  "heute" und "diesen Monat" gehen über die Wanduhrzeit (sold_local als
  Europe/Vienna), damit ein Kauf um 23:30 nicht in den Vortag rutscht.
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
  with tz as (select (now() at time zone 'Europe/Vienna') as jetzt_local)
  select
    msp.machine_id,
    count(*) filter (where msp.sold_local::date = (select jetzt_local::date from tz)),
    coalesce(sum(msp.amount_cents) filter (where msp.sold_local::date = (select jetzt_local::date from tz)), 0),
    count(*) filter (where msp.sold_at >= now() - interval '7 days'),
    coalesce(sum(msp.amount_cents) filter (where msp.sold_at >= now() - interval '7 days'), 0),
    count(*) filter (where date_trunc('month', msp.sold_local) = date_trunc('month', (select jetzt_local from tz))),
    coalesce(sum(msp.amount_cents) filter (where date_trunc('month', msp.sold_local) = date_trunc('month', (select jetzt_local from tz))), 0),
    count(*),
    coalesce(sum(msp.amount_cents), 0),
    count(*) filter (where msp.method = 'karte'),
    count(*) filter (where msp.method = 'bar'),
    count(*) filter (where msp.method = 'unbekannt')
  from public.machine_sale_payments msp
  where msp.park_id = p_park_id
  group by msp.machine_id
$$;
