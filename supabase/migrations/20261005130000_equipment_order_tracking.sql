/*
  # Ausstattung: freier Mehrwert-Text + Bestellstatus-Verfolgung

  - mehrwert_text: freie Beschreibung des Nutzens, unabhaengig vom
    Euro-Betrag (z. B. "3x mehr Ticketverkaufe" statt einer Zahl).
  - bestellstatus: nur relevant wenn status = 'bestellt' - Amazon-artige
    Fortschrittsanzeige, die der Betreiber auf der Konfigurationsseite sieht.
*/

alter table public.park_equipment_items
  add column if not exists mehrwert_text text,
  add column if not exists bestellstatus text
    check (bestellstatus in ('bestellung_erhalten', 'in_bearbeitung', 'versendet', 'installiert'));
