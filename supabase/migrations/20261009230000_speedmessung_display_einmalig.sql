/*
  # Speedmessung Display: einmalig 1.100 EUR statt 100 EUR im Monat
*/
update public.park_equipment_items
set mehrwert_text = '1.100 € einmalig',
    beschreibung = E'Großes Display direkt an der Bahn\nZeigt Zeit und Geschwindigkeit jeder Fahrt für alle Gäste\nDer Tagesbeste ist sofort zu sehen und motiviert zum nächsten Versuch\nGeschwindigkeit steht zusätzlich direkt auf dem Foto\nEinmalige Zahlung, keine laufenden Kosten für das Display\nBenötigt die Speedmessung\nEinrichtung, Support und Wartung durch uns'
where titel = 'Speedmessung Display';
