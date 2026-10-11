-- PK10 (docs/AUSBAU_PLAN.md): Kategorien in „Preise & Pakete“ im CRM pflegbar – eigene anlegen (z. B. „Hosting & Support“),
-- umbenennen und die Reihenfolge ändern. Shared-Projekt kvpcwlcfgmsmarjtwpsx. Nur Service Role (Edge Functions).
-- - catalog_groups: eine Zeile je Kategorie. Die sechs eingebauten (built_in) lassen sich nicht löschen.
--   texts: { de:{name,sub}, en:{…}, … } – name = Reiter beim Kunden, sub = Zeile unter der Überschrift.
-- - catalog_packages.grp: feste Liste entfällt, stattdessen Verweis auf catalog_groups.
create table if not exists public.catalog_groups (
  key text primary key,
  sort int not null default 0,
  active boolean not null default true,
  built_in boolean not null default false,
  texts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.catalog_groups enable row level security;
revoke all on table public.catalog_groups from public, anon, authenticated;

insert into public.catalog_groups (key, sort, built_in, texts) values
  ('plan', 10, true, '{"de":{"name":"Marketing"},"en":{"name":"Marketing"},"es":{"name":"Marketing"},"fr":{"name":"Marketing"},"it":{"name":"Marketing"},"nl":{"name":"Marketing"},"lv":{"name":"Mārketings"}}'::jsonb),
  ('shop', 20, true, '{"de":{"name":"Online-Shop"},"en":{"name":"Online shop"},"es":{"name":"Tienda online"},"fr":{"name":"Boutique en ligne"},"it":{"name":"Negozio online"},"nl":{"name":"Webshop"},"lv":{"name":"Tiešsaistes veikals"}}'::jsonb),
  ('speed', 30, true, '{"de":{"name":"Speedmessung"},"en":{"name":"Speed measurement"},"es":{"name":"Medición de velocidad"},"fr":{"name":"Mesure de vitesse"},"it":{"name":"Misurazione velocità"},"nl":{"name":"Snelheidsmeting"},"lv":{"name":"Ātruma mērīšana"}}'::jsonb),
  ('software', 40, true, '{"de":{"name":"Nur Software"}}'::jsonb),
  ('system', 50, true, '{"de":{"name":"Fotosystem"},"en":{"name":"Photo system"},"es":{"name":"Sistema de fotos"},"fr":{"name":"Système photo"},"it":{"name":"Sistema foto"},"nl":{"name":"Fotosysteem"},"lv":{"name":"Foto sistēma"}}'::jsonb),
  ('addon', 60, true, '{"de":{"name":"Zusatzleistungen"}}'::jsonb)
on conflict (key) do nothing;

alter table public.catalog_packages drop constraint if exists catalog_packages_grp_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalog_packages_grp_fkey') then
    alter table public.catalog_packages
      add constraint catalog_packages_grp_fkey foreign key (grp) references public.catalog_groups(key) on update cascade on delete restrict;
  end if;
end $$;
