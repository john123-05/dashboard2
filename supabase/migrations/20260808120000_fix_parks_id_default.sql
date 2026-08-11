alter table public.parks
  alter column id set default gen_random_uuid();
