/*
  # Konfiguration/Shop-Seite: Bilder, Vorher/Nachher, Automat-Version, Video-Add-on

  Erweitert die freie Ausstattungsliste (park_equipment_items) um Bilder, damit
  die Operator-Seite "Konfiguration" ein echtes Shop-Gefuehl bekommt statt
  reinem Text. Erweitert liftpic_machine_configs um zwei Felder, die die
  "aktuelle Konfiguration"-Kachel direkt anzeigt (Automat-Version, Video-Add-on) -
  speed_enabled gibt es dort schon.
*/

alter table public.liftpic_machine_configs
  add column if not exists hardware_version text check (hardware_version in ('neu', 'alt')),
  add column if not exists video_enabled boolean not null default false;

alter table public.park_equipment_items
  add column if not exists image_url text,
  add column if not exists before_image_url text,
  add column if not exists after_image_url text;

alter table public.park_equipment_items drop constraint if exists park_equipment_items_kategorie_check;
alter table public.park_equipment_items add constraint park_equipment_items_kategorie_check
  check (kategorie in ('Automat', 'Kamera', 'Zubehoer', 'Software', 'Webshop', 'Sonstiges'));

-- Oeffentlicher Bucket wie bei anderen nicht-sensiblen Bild-Assets (siehe
-- liftpic-asset-deployments) - Produktbilder, keine Gast- oder Zahlungsdaten.
-- Nur der Service Role (admin-park-equipment) laedt hoch, die Operator-Seite
-- liest nur die gespeicherte public URL.
insert into storage.buckets (id, name, public)
values ('equipment-images', 'equipment-images', true)
on conflict (id) do nothing;
