/*
  # Freischalten per Social Media + Kontaktfelder (E-Mail / Telefon)

  park_survey_settings bekommt einen dritten Modus 'social' und die
  Kontakt-Einstellungen:
    - email_mode / phone_mode: off | optional | required
        Gilt im E-Mail-Modus und als Kontaktschritt im Social-Modus.
    - social (jsonb): {
        platforms: ["instagram","facebook","tiktok"],
        handle: "@imster_bergbahnen", hashtag: "#alpinecoaster",
        instructions: {de,en}, share_text: {de,en},
        giveaway_enabled: bool, giveaway_text: {de,en},
        post_link: "off"|"optional"|"required"
      }

  Ablauf im Social-Modus: Gast gibt Name + Kontakt an -> Foto ist frei ->
  auf der Freischaltungs-Seite steht "Jetzt teilen" (Hashtag, Markierung) und
  ein Feld für den Link zum eigenen Beitrag (Gewinnspiel-Eintrag).
  Ob ein Beitrag wirklich veröffentlicht wurde, kann das System nicht prüfen;
  der Link ist nur eine Angabe des Gastes.

  Neue Tabelle park_social_entries (nur Service Role): ein Eintrag je
  Freischaltung im Social-Modus.
*/

alter table public.park_survey_settings
  drop constraint if exists park_survey_settings_mode_check;
alter table public.park_survey_settings
  add constraint park_survey_settings_mode_check
  check (mode in ('email', 'survey', 'social'));

alter table public.park_survey_settings
  add column if not exists email_mode text not null default 'required'
    check (email_mode in ('off', 'optional', 'required')),
  add column if not exists phone_mode text not null default 'off'
    check (phone_mode in ('off', 'optional', 'required')),
  add column if not exists social jsonb not null default '{}'::jsonb;

create table if not exists public.park_social_entries (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  photo_id uuid references public.photos(id) on delete set null,
  name text,
  email text,
  phone text,
  giveaway_opt_in boolean not null default false,
  -- vom Gast nach dem Teilen eingetragen (optional)
  platform text,
  handle text,
  post_url text,
  posted_at timestamptz,
  locale text,
  country_code text,
  created_at timestamptz not null default now()
);

create index if not exists park_social_entries_park_time_idx
  on public.park_social_entries (park_id, created_at desc);

alter table public.park_social_entries enable row level security;
-- bewusst keine Policy: gelesen und geschrieben nur über Edge-Functions.

alter table public.photo_claims
  add column if not exists phone text,
  add column if not exists social_entry_id uuid
    references public.park_social_entries(id) on delete set null;
