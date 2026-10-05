/*
  # Vorschau-Link fuer Ausstattungs-Eintraege

  Staff kann bei einem Eintrag (typischerweise Kategorie "Webshop") einen
  Link zu einer echten Vorschau-Seite hinterlegen (z. B. den "Second Chance
  Sales"-Shop-Prototyp im imst-Repo), den der Betreiber auf der
  Konfigurationsseite direkt oeffnen kann - statt nur Bild/Text.
*/

alter table public.park_equipment_items
  add column if not exists preview_url text;
