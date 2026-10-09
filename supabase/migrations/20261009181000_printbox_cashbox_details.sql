/*
  # PrintBox und Cashbox: Beschreibung als Stichpunkte und drei Bilder

  Beschreibung: eine Zeile je Punkt (die Konfigurationsseite zeigt sie als
  Liste). Bilder: Startbild (3D), Frontansicht, Seitenansicht - Dateien liegen
  im Dashboard unter /produkte/ (public/).
*/
update public.park_equipment_items
set beschreibung = E'Nachrüstbares Modul\nWandmontiertes Metallgehäuse (Aluminium/Stahl), IP 54\nAbschließbare Fronttür\nMaße (H × B × T): 50 × 50 × 50 cm\nOberfläche und Grafik projektspezifisch\nInklusive Fotodrucker DNP RX1 HS\nBildausgabe ca. 300 × 70 mm\nVoraussetzung: Dialogbox M oder L, USB-Anschluss',
    image_url = '/produkte/printbox-1.jpg',
    before_image_url = '/produkte/printbox-2.jpg',
    after_image_url = '/produkte/printbox-3.jpg'
where titel = 'PrintBox';

update public.park_equipment_items
set beschreibung = E'Nachrüstbares Modul\nWandmontiertes Metallgehäuse (Aluminium/Stahl), IP 54\nAbschließbare Fronttür\nMaße (H × B × T): 50 × 23 × 23 cm\nLackierung und Grafik projektspezifisch\nInklusive Münzsystem (6 Münzsorten, Europa)\nMünzeinwurf ca. 3 × 10 cm, Münzrückgabe ca. 100 × 40 mm, Display ca. 60 × 40 mm\nOptional: Scheinprüfer (3 Sorten, Europa), ca. 60 × 60 mm, 1.400 € einmalig\nVoraussetzung: Dialogbox M oder L, USB-Anschluss',
    image_url = '/produkte/cashbox-1.jpg',
    before_image_url = '/produkte/cashbox-2.jpg',
    after_image_url = '/produkte/cashbox-3.jpg'
where titel = 'Cashbox';
