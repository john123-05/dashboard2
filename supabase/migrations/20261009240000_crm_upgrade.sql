/*
  # Kundendaten-Erfassung und Hosting (CRM) als Upgrade-Produkt

  Gaeste-Kontakte, Freischalt-Wege (E-Mail, Umfrage, Social Media), Pixel,
  Besucher nach Standort. 49 EUR/Monat, 12 Monate im Voraus 441 EUR (3 Monate
  geschenkt), 48 Monate im Voraus 2.058 EUR (6 Monate geschenkt).
  Bilder: Freischaltseite, Umfrage, Besucher-Weltkarte.
*/
insert into public.park_equipment_items
  (park_id, kategorie, titel, beschreibung, status, mehrwert_text, sortierung,
   image_url, before_image_url, after_image_url)
select p.park_id, 'Software', 'Kundendaten-Erfassung und Hosting',
  E'QR-Code auf gedruckten Fotos zum Freischalten\nHosting der Bilder online für deine Gäste\nGäste bekommen die digitale Version ihres Fotos\nE-Mail-Adressen und Kontakte deiner Gäste sammeln, Liste und Export\nFreischalt-Weg wählen: E-Mail, Umfrage oder Social Media\nUmfrage mit Bewertung und Weiterempfehlung (NPS)\nSocial-Media-Aktion installieren\nWerbe-Pixel installieren (Meta und Google)\nBesucher nach Standort und Sprache auf der Weltkarte\nVerwaltung aller Gästedaten im Dashboard\nVerwaltete Datenbank, Wartung und Updates durch uns',
  'empfohlen', '49 € pro Monat', 70,
  '/produkte/crm-1.jpg', '/produkte/crm-2.jpg', '/produkte/crm-3.jpg'
from (select distinct park_id from public.liftpic_machine_configs where park_id is not null) p
where not exists (
  select 1 from public.park_equipment_items e where e.park_id = p.park_id and e.titel = 'Kundendaten-Erfassung und Hosting'
);
