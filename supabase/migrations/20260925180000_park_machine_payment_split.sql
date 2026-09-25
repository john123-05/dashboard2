/*
  # Karte/Bar und Kartenmarken je Zeitraum und Automat

  Die Automaten-Karte auf der Umsatzseite zeigte "93 % Karte / 7 % Bar" immer
  gleich, egal welcher Zeitraum gewählt war, weil park_machine_revenue() Karte
  und Bar nur als Gesamtwert liefert. Diese Funktion liefert sie je Zeitraum
  (heute, woche, monat, gesamt - dieselben Grenzen wie park_machine_revenue).
*/
create or replace function public.park_machine_payment_split(p_park_id uuid)
returns table (machine_id text, periode text, method text, card_scheme text, anzahl bigint)
language sql
stable
set search_path = public
as $$
  with tz as (select (now() at time zone 'Europe/Vienna') as jetzt_local),
  k as (
    select msp.machine_id, msp.sold_local, msp.sold_at, msp.method, msp.card_scheme
    from public.machine_sale_payments msp
    where msp.park_id = p_park_id
  ),
  p as (
    select k.machine_id, 'heute'::text as periode, k.method, k.card_scheme
      from k where k.sold_local::date = (select jetzt_local::date from tz)
    union all
    select k.machine_id, 'woche', k.method, k.card_scheme
      from k where k.sold_at >= now() - interval '7 days'
    union all
    select k.machine_id, 'monat', k.method, k.card_scheme
      from k where date_trunc('month', k.sold_local) = date_trunc('month', (select jetzt_local from tz))
    union all
    select k.machine_id, 'gesamt', k.method, k.card_scheme from k
  )
  select p.machine_id, p.periode, p.method, p.card_scheme, count(*)::bigint
  from p
  group by p.machine_id, p.periode, p.method, p.card_scheme
$$;
