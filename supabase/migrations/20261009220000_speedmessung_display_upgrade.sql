/*
  # Speedmessung Display als eigenes Upgrade-Produkt

  Das Display an der Bahn (zeigt Zeit und km/h fuer alle Gaeste) einzeln
  buchbar, auch fuer Parks mit laufender Speedmessung. Preis: Aufpreis
  100 EUR/Monat im 1. Jahr (= 249 EUR statt 149 EUR), danach inklusive.
  Bilder: Anzeigetafel, Tafel mit Gastfoto, Fahrtfoto mit km/h.
*/
insert into public.park_equipment_items
  (park_id, kategorie, titel, beschreibung, status, mehrwert_text, sortierung,
   image_url, before_image_url, after_image_url)
select p.park_id, 'Automat', 'Speedmessung Display',
  E'Großes Display direkt an der Bahn\nZeigt Zeit und Geschwindigkeit jeder Fahrt für alle Gäste\nDer Tagesbeste ist sofort zu sehen und motiviert zum nächsten Versuch\nGeschwindigkeit steht zusätzlich direkt auf dem Foto\nKeine Einmalkosten für das Display\nAb dem 2. Jahr im Preis inklusive\nBenötigt die Speedmessung\nEinrichtung, Support und Wartung durch uns',
  'empfohlen', '100 € pro Monat im 1. Jahr · danach inklusive', 81,
  '/speedmessung/display.jpg', '/produkte/display-2.jpg', '/speedmessung/langzeit.jpg'
from (select distinct park_id from public.liftpic_machine_configs where park_id is not null) p
where not exists (
  select 1 from public.park_equipment_items e where e.park_id = p.park_id and e.titel = 'Speedmessung Display'
);
