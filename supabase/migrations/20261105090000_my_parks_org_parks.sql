-- my_parks: Parks, die ein Betreiber-Konto im Dashboard sieht.
-- Bisher nur ueber operator_park_links (entsteht, wenn sich jemand einmal mit Park-Passwort verbindet).
-- Konten, die wir selbst anlegen (z. B. Kalahari, ohne Park-Passwort), hatten keine Zeile und landeten
-- nach jeder Anmeldung wieder auf der Anmeldeseite. Jetzt zaehlen auch die Parks der eigenen
-- Organisation (aktive Mitgliedschaft), aber nur die, die in allowed_park_ids des Kontos stehen.
-- Name: aus park_access, sonst aus parks.
create or replace function public.my_parks()
 returns table(id uuid, name text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with mine as (
    select l.park_id
      from operator_park_links l
     where l.user_id = auth.uid()
    union
    select p.id
      from parks p
      join organization_memberships m on m.organization_id = p.organization_id
     where m.user_id = auth.uid()
       and m.disabled_at is null
       -- Nur Parks, die im Konto ausdruecklich stehen: fast alle Konten haengen an einer
       -- Organisation mit allen Parks - ohne diese Grenze saehen sie alle 36.
       and jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'allowed_park_ids') = 'array'
       and (auth.jwt() -> 'app_metadata' -> 'allowed_park_ids') ? p.id::text
  )
  select x.park_id as id,
         coalesce(nullif((select pa.park_name from park_access pa where pa.park_id = x.park_id limit 1), ''), p.name, '') as name
    from mine x
    left join parks p on p.id = x.park_id
   order by 2;
$function$;
