/*
  # CRM-Produkt umbenannt: "CRM Besucherdaten"
*/
update public.park_equipment_items
set titel = 'CRM Besucherdaten'
where titel in ('CRM', 'Kundendaten-Erfassung und Hosting');
