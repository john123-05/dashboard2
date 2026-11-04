-- Willkommens-Links für neue Kunden (Betreiber-Projekt): ein langer Link (z. B. 14 Tage gültig), der beim
-- Anklicken frisch einen Supabase-„Passwort festlegen“-Link erzeugt (die laufen sonst nach 1 Stunde ab).
-- Gespeichert wird nur der SHA-256 des Tokens. Nur die Function welcome-link (Service Role) liest die Tabelle.
create table if not exists public.welcome_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  clicks integer not null default 0,
  last_clicked_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
alter table public.welcome_links enable row level security;
revoke all on public.welcome_links from public, anon, authenticated;
grant select, insert, update, delete on public.welcome_links to service_role;
