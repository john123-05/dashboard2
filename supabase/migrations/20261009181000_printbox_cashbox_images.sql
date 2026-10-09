/*
  # Bilder fuer PrintBox und Cashbox

  Drei Bilder je Produkt: Startbild (3D-Ansicht), Ansichten mit Massen,
  Preisblatt. Die Dateien liegen im Dashboard unter /produkte/ (public/).
*/
update public.park_equipment_items
set image_url = '/produkte/printbox-1.jpg',
    before_image_url = '/produkte/printbox-2.jpg',
    after_image_url = '/produkte/preise.jpg'
where titel = 'PrintBox';

update public.park_equipment_items
set image_url = '/produkte/cashbox-1.jpg',
    before_image_url = '/produkte/cashbox-2.jpg',
    after_image_url = '/produkte/preise.jpg'
where titel = 'Cashbox';
