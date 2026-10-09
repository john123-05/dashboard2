/*
  # CRM-Produkt umbenannt: "CRM Besucherdaten und Digitale Version Hosting"
*/
update public.park_equipment_items
set titel = 'CRM Besucherdaten und Digitale Version Hosting'
where titel in ('CRM', 'Kundendaten-Erfassung und Hosting', 'CRM Besucherdaten');
