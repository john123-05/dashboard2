-- Seiten-Einstellungen je Park, gesteuert aus dem Liftpictures-CRM (Kunde → Plan).
-- camera_page: 'auto'   = Kamera-Seite erscheint, sobald ein Automat seine Kamera meldet (bisheriges Verhalten)
--              'hidden' = Kamera-Seite bleibt für diesen Kunden im Dashboard und in der App ausgeblendet
-- Gelesen von operator-page-settings, geschrieben von admin-park-page-settings (beide mit Service-Rolle).

create table if not exists public.park_page_settings (
  park_id uuid primary key references public.parks(id) on delete cascade,
  camera_page text not null default 'auto' check (camera_page in ('auto', 'hidden')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.park_page_settings enable row level security;
-- Absichtlich keine Policies: nur die Edge Functions greifen zu.
