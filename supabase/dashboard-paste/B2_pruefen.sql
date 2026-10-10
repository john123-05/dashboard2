-- B2 prüfen · SHARED (kvpcwlcfgmsmarjtwpsx) · nur lesen, ändert nichts
select
  (select count(*) from public.park_entitlements) as zeilen,
  (select relrowsecurity from pg_class where oid = 'public.park_entitlements'::regclass) as rls_an,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'park_entitlements') as policies,
  (select string_agg(column_name, ', ' order by ordinal_position)
     from information_schema.columns
     where table_schema = 'public' and table_name = 'park_entitlements') as spalten,
  (select count(*) from pg_trigger
     where tgrelid = 'public.park_entitlements'::regclass and not tgisinternal) as trigger_anzahl;
