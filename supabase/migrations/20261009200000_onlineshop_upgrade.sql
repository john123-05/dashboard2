/*
  # Online-Shop als Upgrade: "Digitale Nachkaeufe und Merchandising"

  Legt das Online-Shop-Abo als Upgrade-Produkt bei jedem Park mit Automat an.
  Preise: Einrichtung 749 EUR einmalig + 99 EUR im Monat (12 Monate im
  Voraus: 891 EUR, 3 Monate geschenkt) oder Revenue Share 15 %.
  Bilder: Screenshots des Demo-Shops, Dateien unter /produkte/.
  Idempotent: ein Park bekommt den Eintrag nur einmal.
*/
insert into public.park_equipment_items
  (park_id, kategorie, titel, beschreibung, status, mehrwert_text, sortierung,
   image_url, before_image_url, after_image_url)
select p.park_id, 'Webshop', 'Digitale Nachkäufe und Merchandising',
  E'Dein eigener Foto-Shop im Design deines Parks (Name, Logo, Farben, Schrift)\nGäste kaufen ihr Foto auch nach dem Besuch online\nDigitaler Download, Fotoabzug 13×18 und Postkarte\nMerchandising: Tasse, T-Shirt und Kühlschrankmagnet mit dem Foto\nTagespass: alle Fotos des Tages als Download\nUnverkaufte Fotos erneut zum Kauf anbieten\nZahlung über Stripe, Verkäufe und Umsatz live im Dashboard\nHosting, Service und Wartung inklusive\nVoraussetzung für PrintBox und Cashbox\nOptional Full-Service: Druck und Versand übernehmen wir',
  'empfohlen', '749 € einmalig · 99 € pro Monat', 90,
  '/produkte/onlineshop-1.jpg', '/produkte/onlineshop-2.jpg', '/produkte/onlineshop-3.jpg'
from (select distinct park_id from public.liftpic_machine_configs where park_id is not null) p
where not exists (
  select 1 from public.park_equipment_items e
  where e.park_id = p.park_id and e.titel = 'Digitale Nachkäufe und Merchandising'
);
