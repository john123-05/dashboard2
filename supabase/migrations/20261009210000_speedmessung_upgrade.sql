/*
  # Speedmessung als Upgrade-Produkt

  Nur fuer Parks ohne laufende Speedmessung. Das Flag speed_enabled ist dafuer
  nicht verlaesslich (bei Imst gesetzt, obwohl die Messung nicht laeuft), also
  sind die drei Parks mit echter Speedmessung (Tarzans, Plose, Gruenberg)
  ausgenommen - dieselbe Liste wie im Dashboard. Preise: 149 EUR/Monat, mit Display 249 EUR im 1. Jahr und ab
  Jahr 2 149 EUR, 48 Monate 99 EUR/Monat. Hardware kostenlos.
  Bilder: Screenshots Tagesbestenliste, Gaeste-Profil, Wettkampf-Hinweis.
*/
insert into public.park_equipment_items
  (park_id, kategorie, titel, beschreibung, status, mehrwert_text, sortierung,
   image_url, before_image_url, after_image_url)
select p.park_id, 'Software', 'Speedmessung',
  E'Geschwindigkeits-Hardware an der Bahn, kostenlos von uns geliefert\nGeschwindigkeit direkt auf dem Foto\nTagesschnellster, Langsamster und Durchschnitt live im Dashboard\nTagesbestenliste im Design deines Parks\nGäste legen Profilbild und Nutzername an und messen sich mit anderen\nGäste tragen sich per Foto-Code ein, kein Passwort nötig\nNur freigeschaltete, gekaufte Fotos erscheinen in der Liste\nGäste teilen ihre Platzierung auf Social Media\nOptional großes Display an der Bahn\nEinrichtung, Support, Hosting, Datenbank und Wartung durch uns',
  'empfohlen', '149 € pro Monat · 12 Monate Laufzeit', 80,
  '/produkte/speedmessung-1.jpg', '/produkte/speedmessung-2.jpg', '/produkte/speedmessung-3.jpg'
from (select distinct park_id from public.liftpic_machine_configs where park_id is not null) p
where p.park_id not in (
    'e2da6436-6a83-4c39-add3-5f99eb6bd897', -- Tarzans
    '3b08e092-beb5-46ec-9811-5698e86dd83a', -- Plose
    '25c1022b-4e2e-4fc4-b54d-72a4ced2522b'  -- Gruenberg
  )
  and not exists (
    select 1 from public.park_equipment_items e where e.park_id = p.park_id and e.titel = 'Speedmessung'
  );
