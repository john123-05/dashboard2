-- Demo shop for operators: branding text, product catalog, an unguessable
-- preview link (demo_token) and the "Shop beantragen" request.
-- Project: kvpcwlcfgmsmarjtwpsx.
alter table public.park_shop_settings
  add column if not exists shop_name text,
  add column if not exists welcome_text text,
  add column if not exists products jsonb not null default '[]'::jsonb,
  add column if not exists demo_token uuid not null default gen_random_uuid(),
  add column if not exists activation_requested_at timestamptz,
  add column if not exists activation_requested_by text;

create unique index if not exists park_shop_settings_demo_token_idx
  on public.park_shop_settings (demo_token);

notify pgrst, 'reload schema';
