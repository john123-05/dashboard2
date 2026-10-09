/*
  # PrintBox und Cashbox als Upgrade bei jedem installierten Park

  Legt je Park, der einen Liftpic-Automaten hat (liftpic_machine_configs),
  zwei Konfigurations-Eintraege im Status 'empfohlen' an (= "Upgrade" auf der
  Konfigurationsseite). Preise und Beschreibung stammen aus dem Preisblatt.
  Die drei Bilder je Produkt (Startbild, Produkte/Beschreibung, Preise) werden
  danach im CRM beim Eintrag hochgeladen: image_url, before_image_url,
  after_image_url - sind alle drei gesetzt, zeigt die Seite eine Galerie.
  Idempotent: ein Park bekommt jeden Eintrag nur einmal.
*/

insert into public.park_equipment_items
  (park_id, kategorie, titel, beschreibung, status, mehrwert_text, sortierung)
select p.park_id, 'Zubehoer', 'PrintBox',
  'Nachrüstbares Modul. Wandmontiertes Metallgehäuse (Aluminium/Stahl), IP 54, abschließbare Fronttür, H × B × T = 50 × 50 × 50 cm. Oberfläche und Grafik projektspezifisch. Inklusive Fotodrucker DNP RX1 HS. Voraussetzung: Dialogbox M oder L, USB-Anschluss.',
  'empfohlen', '4.900 € einmalig · Service/Hosting 10 € pro Monat', 100
from (select distinct park_id from public.liftpic_machine_configs where park_id is not null) p
where not exists (
  select 1 from public.park_equipment_items e where e.park_id = p.park_id and e.titel = 'PrintBox'
);

insert into public.park_equipment_items
  (park_id, kategorie, titel, beschreibung, status, mehrwert_text, sortierung)
select p.park_id, 'Zubehoer', 'Cashbox',
  'Nachrüstbares Modul. Wandmontiertes Metallgehäuse (Aluminium/Stahl), IP 54, abschließbare Fronttür, H × B × T = 50 × 23 × 23 cm. Lackierung und Grafik projektspezifisch. Inklusive Münzsystem (6 Münzsorten, Europa). Optional: Scheinprüfer (3 Sorten, Europa) für 1.400 € einmalig. Voraussetzung: Dialogbox M oder L, USB-Anschluss.',
  'empfohlen', '5.500 € einmalig · Service/Hosting 15 € pro Monat', 101
from (select distinct park_id from public.liftpic_machine_configs where park_id is not null) p
where not exists (
  select 1 from public.park_equipment_items e where e.park_id = p.park_id and e.titel = 'Cashbox'
);
