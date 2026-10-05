/*
  # Ausstattung / Konfiguration je Park (freie Liste)

  Staff pflegt pro Park eine einfache Liste: was der Kunde hat, was man ihm
  empfehlen koennte. Keine Katalog-Tabelle, keine Verknuepfungen - bewusst
  simpel zum Start (siehe Plan "Konfiguration/Shop"-Seite).
*/

create table if not exists public.park_equipment_items (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  kategorie text not null default 'Sonstiges'
    check (kategorie in ('Automat', 'Kamera', 'Zubehoer', 'Software', 'Sonstiges')),
  titel text not null,
  beschreibung text,
  status text not null default 'empfohlen' check (status in ('vorhanden', 'empfohlen', 'bestellt')),
  geschaetzter_mehrumsatz_cents integer,
  sortierung integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists park_equipment_items_park_idx
  on public.park_equipment_items (park_id, sortierung);

alter table public.park_equipment_items enable row level security;

drop policy if exists "Admins can read park equipment" on public.park_equipment_items;
create policy "Admins can read park equipment"
  on public.park_equipment_items
  for select
  to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()));
-- Kein insert/update/delete per Policy: nur admin-park-equipment (Staff,
-- service role) schreibt. Operator-Lesezugriff laeuft komplett ueber
-- operator-park-equipment (eigenes Projekt, eigene Park-Autorisierung).
