-- Park access control for dashboard
create extension if not exists pgcrypto;

create table if not exists park_access (
  park_id uuid primary key,
  park_name text not null,
  password_hash text not null,
  created_at timestamptz default now()
);

alter table park_access enable row level security;

-- No direct read/write from clients
drop policy if exists "deny direct access" on park_access;
create policy "deny direct access" on park_access
  for all using (false) with check (false);

-- Verify park password
create or replace function verify_park_access(p_park_id uuid, p_password text)
returns boolean
language plpgsql
security definer
as $$
declare
  ok boolean;
begin
  select (password_hash = crypt(p_password, password_hash))
    into ok
  from park_access
  where park_id = p_park_id;

  return coalesce(ok, false);
end;
$$;

grant execute on function verify_park_access(uuid, text) to authenticated;
