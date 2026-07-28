create table if not exists public.park_price_history (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  effective_from timestamptz not null,
  price_per_photo_cents integer not null check (price_per_photo_cents >= 0),
  change_mode text not null default 'future' check (change_mode in ('future', 'retroactive')),
  changed_by_operator_id text,
  created_at timestamptz not null default now(),
  unique (park_id, effective_from)
);

create index if not exists park_price_history_park_id_effective_from_idx
  on public.park_price_history (park_id, effective_from desc);

alter table public.park_price_history enable row level security;

drop policy if exists "Admins can read park price history" on public.park_price_history;
create policy "Admins can read park price history"
  on public.park_price_history
  for select
  to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()));

comment on table public.park_price_history is
  'Preisverlauf für Kiosk-/Automatenparks. Erlaubt Preiswechsel ab jetzt oder rückwirkende Neuberechnungen im Dashboard.';

comment on column public.park_price_history.effective_from is
  'Ab diesem Zeitpunkt gilt der Preis. Für alte Tages-Rollups wird der Preis auf Business-Date-Ebene aufgelöst.';

insert into public.park_price_history (park_id, effective_from, price_per_photo_cents, change_mode)
select
  p.id,
  '1970-01-01T00:00:00Z'::timestamptz,
  p.price_per_photo_cents,
  'retroactive'
from public.parks p
where p.price_per_photo_cents is not null
  and not exists (
    select 1
    from public.park_price_history h
    where h.park_id = p.id
  );
