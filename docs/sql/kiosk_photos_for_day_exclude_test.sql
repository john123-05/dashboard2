-- Testfotos aus der Tages-Kaeufeansicht ausschliessen
--
-- Projekt: kvpcwlcfgmsmarjtwpsx (geteiltes Projekt, wo `photos` liegt)
--
-- WAS PASSIERT IST
-- ----------------
-- Auf der Kaeufe-Seite tauchten vom Dashboard ausgeloeste Testfotos als
-- Kaeufe auf: mit dem echten Preis des Parks, aber ohne jede Zahlungsart
-- (unbekannt), weil ein Testfoto nie einen echten Verkauf durchlaeuft -
-- weder Muenze noch Karte noch Statistic.txt-Zeile gehoert dazu.
--
-- Fuer den Listenabruf ohne Datum ist das schon behoben (in der Function
-- kiosk-photo-purchases, mit "is_test=eq.false" im Abruf). Diese Funktion
-- hier bedient die TAGESANSICHT (ein einzelner Kalendertag) und hat dieselbe
-- Luecke: sie filtert is_test nicht.
--
-- WIE AUSFUEHREN
-- --------------
-- Supabase-Oberflaeche -> SQL Editor -> dieses Statement einfuegen und
-- ausfuehren. Aendert nur die Funktion selbst, keine Daten.

create or replace function public.get_kiosk_photos_for_day(p_park_id uuid, p_business_date date)
returns table(id uuid, captured_at timestamp with time zone, camera_code text)
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    p.id,
    coalesce(p.captured_at, p.created_at) as captured_at,
    coalesce(p.camera_code, 'unknown') as camera_code
  from public.photos p
  join public.parks pk on pk.id = p.park_id
  where p.park_id = p_park_id
    and coalesce(p.is_test, false) = false
    and (coalesce(p.captured_at, p.created_at) at time zone coalesce(pk.timezone, 'Europe/Vienna'))::date = p_business_date
  order by captured_at asc;
$function$;
