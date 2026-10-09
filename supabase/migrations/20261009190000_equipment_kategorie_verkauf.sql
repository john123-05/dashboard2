/*
  # Kategorie "Verkauf" fuer Ausstattung

  PrintBox und Cashbox sind Verkaufs-Module und stehen jetzt unter "Verkauf"
  statt "Zubehoer".
*/
alter table public.park_equipment_items drop constraint if exists park_equipment_items_kategorie_check;
alter table public.park_equipment_items add constraint park_equipment_items_kategorie_check
  check (kategorie in ('Automat', 'Kamera', 'Zubehoer', 'Verkauf', 'Software', 'Webshop', 'Sonstiges'));

update public.park_equipment_items
set kategorie = 'Verkauf'
where titel in ('PrintBox', 'Cashbox');
