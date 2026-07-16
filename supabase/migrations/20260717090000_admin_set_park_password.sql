/*
  # Admin helper: set/replace a park's login password in one step

  Why:
  park_access already exists (20260214090100_create_park_access.sql) and has
  zero direct read/write policies on purpose - the only way in is the
  verify_park_access RPC (for logging in) or, now, this RPC (for staff to set
  a password when creating/managing a park), both SECURITY DEFINER. Hashing
  must happen here in Postgres (pgcrypto's crypt()/gen_salt('bf')), not in
  the edge function, since there's no other server-side place to run it.

  What:
  Upserts a park_access row for the given park_id. Called only from the new
  admin-set-park-password edge function (dashboard2's own project), which
  verifies the caller is a real staff/admin account (against the shared
  project's admin_users) before ever invoking this.
*/
create or replace function admin_set_park_password(p_park_id uuid, p_park_name text, p_password text)
returns void
language plpgsql
security definer
as $$
begin
  insert into park_access (park_id, park_name, password_hash)
  values (p_park_id, p_park_name, crypt(p_password, gen_salt('bf')))
  on conflict (park_id) do update
    set park_name = excluded.park_name,
        password_hash = excluded.password_hash;
end;
$$;

grant execute on function admin_set_park_password(uuid, text, text) to service_role;
