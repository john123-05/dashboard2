/*
  # Park-Umfragen: Foto freischalten nach einer Umfrage statt mit E-Mail

  Pro Park stellt der Betreiber im Dashboard ein, was die Claim-Seite vor der
  Freischaltung abfragt:
    - mode = 'email'  : Name + E-Mail + Marketing-Opt-in (wie bisher, Vorgabe)
    - mode = 'survey' : ein paar Fragen (NPS 0-10, Sterne, Ja/Nein, Auswahl, Text)

  Nach der Freischaltung zeigt die Seite einen Bewertungs-Link (review_url), wenn
  der Wert der Score-Frage mindestens review_min_score ist. review_min_score = 0
  zeigt den Link allen Antwortenden.

  Lesen darf die Claim-Seite (anon) nur Einstellungen und Fragen - nichts davon
  ist sensibel. Antworten schreibt ausschliesslich die Edge-Function (Service
  Role), gelesen werden sie nur ueber operator-survey.

  Umfrage-Claims haben keine E-Mail: photo_claims.email / full_name sind NOT NULL,
  deshalb steht dort ein leerer String. survey_response_id verknuepft die Antwort.
*/

create table if not exists public.park_survey_settings (
  park_id uuid primary key references public.parks(id) on delete cascade,
  mode text not null default 'email' check (mode in ('email', 'survey')),
  review_url text,
  review_min_score integer not null default 8 check (review_min_score between 0 and 10),
  -- Texte je Sprache, z. B. {"de": "...", "en": "..."}; fehlt eine Sprache,
  -- nimmt die Claim-Seite Englisch, dann Deutsch.
  intro jsonb not null default '{}'::jsonb,
  review_text jsonb not null default '{}'::jsonb,
  thanks_text jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.park_survey_questions (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  position integer not null default 0,
  type text not null check (type in ('nps', 'stars', 'yesno', 'choice', 'text')),
  prompt jsonb not null default '{}'::jsonb,
  -- nur fuer type = 'choice': [{"de": "...", "en": "..."}, ...]
  options jsonb not null default '[]'::jsonb,
  required boolean not null default true,
  -- Die Frage, deren Wert ueber den Bewertungs-Link entscheidet (nps oder stars).
  is_score_question boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists park_survey_questions_park_idx
  on public.park_survey_questions (park_id, position);

create table if not exists public.park_survey_responses (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  photo_id uuid references public.photos(id) on delete set null,
  -- {"<question_id>": <wert>}
  answers jsonb not null default '{}'::jsonb,
  -- Wert der Score-Frage, auf 0-10 normiert (Sterne 1-5 -> 2-10)
  score integer,
  locale text,
  country_code text,
  review_link_shown boolean not null default false,
  submitted_at timestamptz not null default now()
);

create index if not exists park_survey_responses_park_time_idx
  on public.park_survey_responses (park_id, submitted_at desc);

alter table public.photo_claims
  add column if not exists survey_response_id uuid
  references public.park_survey_responses(id) on delete set null;

alter table public.park_survey_settings enable row level security;
alter table public.park_survey_questions enable row level security;
alter table public.park_survey_responses enable row level security;

-- Oeffentlich lesbar: die Claim-Seite braucht Modus, Fragen und Texte ohne Login.
drop policy if exists "park survey settings public read" on public.park_survey_settings;
create policy "park survey settings public read" on public.park_survey_settings
  for select to anon, authenticated using (true);

drop policy if exists "park survey questions public read" on public.park_survey_questions;
create policy "park survey questions public read" on public.park_survey_questions
  for select to anon, authenticated using (active);

-- Antworten: bewusst keine Policy (nur Service Role).
