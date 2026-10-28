-- Betreiber-Projekt xcrxltiiovpoladpaewd: „Konto erstellen“ mit Park und Park-Passwort (Web und App).
-- link_park_access gibt einem neuen Konto (noch ohne Organisation) Zugang zur Organisation des Parks und
-- beschränkt es serverseitig auf seine verknüpften Parks (app_metadata.allowed_park_ids, geprüft in
-- requireOperatorForPark). Bestehende Konten ohne Beschränkung bleiben unverändert; bereits beschränkte
-- Konten bekommen den neuen Park in ihre Liste.
create or replace function public.link_park_access(p_park_id uuid, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ok boolean;
  uid uuid := auth.uid();
  org uuid;
  is_new boolean;
  allowed jsonb;
begin
  if uid is null then
    return false;
  end if;
  select (password_hash = crypt(p_password, password_hash))
    into ok
    from park_access
   where park_id = p_park_id;
  if not coalesce(ok, false) then
    return false;
  end if;

  insert into operator_park_links (user_id, park_id)
  values (uid, p_park_id)
  on conflict do nothing;

  select not exists (select 1 from organization_memberships where user_id = uid) into is_new;
  select organization_id into org from parks where id = p_park_id;
  if is_new and org is not null then
    insert into organization_memberships (user_id, organization_id, role)
    values (uid, org, 'org_owner')
    on conflict (user_id, organization_id) do nothing;
  end if;

  select coalesce(raw_app_meta_data -> 'allowed_park_ids', '[]'::jsonb) into allowed from auth.users where id = uid;
  if is_new or jsonb_array_length(allowed) > 0 then
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
             'allowed_park_ids',
             (select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
                from (select jsonb_array_elements_text(allowed) as v union select p_park_id::text) s))
     where id = uid;
  end if;
  return true;
end;
$$;

revoke all on function public.link_park_access(uuid, text) from public, anon;
grant execute on function public.link_park_access(uuid, text) to authenticated;

-- Konto in der App löschen (App Store 5.1.1(v)): löscht das angemeldete Konto samt Profil, Mitgliedschaft,
-- Park-Verknüpfungen, Push-Tokens und Einstellungen (ON DELETE CASCADE). Support-Tickets und Overlays
-- gehören zum Park und bleiben; ihr Autor wird dafür auf NULL gesetzt.
do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, a.attname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f'
       and c.confrelid = 'public.operator_profiles'::regclass
       and c.conrelid::regclass::text in ('overlay_assets', 'support_tickets', 'support_ticket_messages')
  loop
    execute format('alter table %s alter column %I drop not null', r.tbl, r.attname);
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references public.operator_profiles(id) on delete set null',
                   r.tbl, r.conname, r.attname);
  end loop;
end;
$$;

create or replace function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  delete from auth.users where id = auth.uid();
  return true;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
