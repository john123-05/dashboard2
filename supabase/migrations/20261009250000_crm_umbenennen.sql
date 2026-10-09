/*
  # CRM-Produkt umbenannt: "Kundendaten-Erfassung und Hosting"
*/
update public.park_equipment_items
set titel = 'Kundendaten-Erfassung und Hosting'
where titel = 'CRM';
