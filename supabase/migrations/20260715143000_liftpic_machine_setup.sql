-- Liftpic machine setup: one place for staff to configure what each
-- attraction PC/uploader should do. This keeps customer-facing words simple
-- while retaining legacy codes for compatibility with existing photo systems.

alter table public.parks add column if not exists price_per_photo_cents integer;
alter table public.parks add column if not exists timezone text not null default 'Europe/Vienna';
alter table public.parks add column if not exists opening_hours jsonb;

create or replace function public.set_generic_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.liftpic_machine_configs (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  attraction_id uuid references public.attractions(id) on delete set null,
  machine_id text not null,
  machine_label text not null,
  camera_code text not null default 'cam1',
  camera_label text not null default 'Kamera 1',
  legacy_customer_code text not null default '0000',
  mode text not null default 'sold_only',
  qr_enabled boolean not null default true,
  speed_enabled boolean not null default true,
  count_rides_enabled boolean not null default true,
  upload_all_photos boolean not null default false,
  shadow_mode boolean not null default true,
  raw_dir text not null default 'C:\liftpic\fotos',
  processed_dir text not null default 'C:\liftpic\fotos\out',
  qrcode_dir text not null default 'C:\liftpic\fotos\qrcode',
  webout_dir text not null default 'C:\liftpic\fotos\webout',
  statistic_file text not null default 'C:\liftpic\samuel_neu\Statistic.txt',
  print_count_file text not null default 'C:\liftpic\samuel_neu\PrintCount.txt',
  paper_warn_remaining integer not null default 30,
  pairing_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  device_token text not null default encode(gen_random_bytes(24), 'hex'),
  pairing_status text not null default 'ready',
  last_seen_at timestamptz,
  last_status jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_liftpic_machine_mode check (mode in ('sold_only', 'all_photos', 'count_only')),
  constraint valid_liftpic_pairing_status check (pairing_status in ('ready', 'paired', 'disabled'))
);

create unique index if not exists liftpic_machine_configs_machine_camera_idx
  on public.liftpic_machine_configs(machine_id, camera_code);

create index if not exists liftpic_machine_configs_park_idx
  on public.liftpic_machine_configs(park_id, is_active);

alter table public.liftpic_machine_configs enable row level security;

drop policy if exists "Admins can read liftpic machine configs" on public.liftpic_machine_configs;
create policy "Admins can read liftpic machine configs"
  on public.liftpic_machine_configs
  for select
  to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()));

-- Writes go through admin-liftpic-machines / machine Edge Functions only.

drop trigger if exists trg_liftpic_machine_configs_updated_at on public.liftpic_machine_configs;
create trigger trg_liftpic_machine_configs_updated_at
before update on public.liftpic_machine_configs
for each row execute function public.set_generic_updated_at();
