/*
  # Hausadresse als drittes Kontaktfeld (E-Mail / Telefon / Adresse)

  Gleiches Muster wie email_mode/phone_mode: off | optional | required.
  Zaehlt NICHT zur "mindestens E-Mail oder Telefon"-Pflicht im E-Mail-Modus -
  die Adresse ist rein zusaetzlich.
*/

alter table public.park_survey_settings
  add column if not exists address_mode text not null default 'off'
    check (address_mode in ('off', 'optional', 'required'));

alter table public.photo_claims
  add column if not exists address text;
