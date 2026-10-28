-- Betreiber-Projekt xcrxltiiovpoladpaewd: Konto fest mit seinem Park verknüpfen.
-- Das Park-Passwort braucht man nur noch einmal (beim ersten Anmelden bzw. nach „Konto erstellen“);
-- danach reichen E-Mail und Passwort. Mitarbeiter übernehmen die Parks ihres Betreibers (manage-staff).
-- verify_park_access bleibt für ältere App-Versionen bestehen.
create table if not exists public.operator_park_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  park_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, park_id)
);

alter table public.operator_park_links enable row level security;
drop policy if exists "Operators read own park links" on public.operator_park_links;
create policy "Operators read own park links" on public.operator_park_links
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.operator_park_links from anon, authenticated;

-- Park-Passwort prüfen und bei Erfolg das angemeldete Konto mit dem Park verknüpfen.
create or replace function public.link_park_access(p_park_id uuid, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ok boolean;
begin
  if auth.uid() is null then
    return false;
  end if;
  select (password_hash = crypt(p_password, password_hash))
    into ok
    from park_access
   where park_id = p_park_id;
  if coalesce(ok, false) then
    insert into operator_park_links (user_id, park_id)
    values (auth.uid(), p_park_id)
    on conflict do nothing;
  end if;
  return coalesce(ok, false);
end;
$$;

revoke all on function public.link_park_access(uuid, text) from public, anon;
grant execute on function public.link_park_access(uuid, text) to authenticated;

-- Parks, mit denen das angemeldete Konto verknüpft ist (Name aus park_access).
create or replace function public.my_parks()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select l.park_id as id, coalesce(pa.park_name, '') as name
    from operator_park_links l
    left join park_access pa on pa.park_id = l.park_id
   where l.user_id = auth.uid()
   order by 2;
$$;

revoke all on function public.my_parks() from public, anon;
grant execute on function public.my_parks() to authenticated;
