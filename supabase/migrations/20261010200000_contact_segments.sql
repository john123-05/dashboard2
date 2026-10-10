-- C3 (docs/PRODUKT_PLAN.md): Kontakt-Segmente (von Hand zusammengestellte Listen). Shared-Projekt.
-- Mitglieder sind Freischaltungen (`photo_claims.id`); E-Mails können ein Segment als Empfängerkreis wählen.
create table if not exists public.park_contact_segments (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (park_id, name)
);
create table if not exists public.park_contact_segment_members (
  segment_id uuid not null references public.park_contact_segments(id) on delete cascade,
  claim_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (segment_id, claim_id)
);
alter table public.park_contact_segments enable row level security;
alter table public.park_contact_segment_members enable row level security;
revoke all on table public.park_contact_segments, public.park_contact_segment_members from public, anon, authenticated;
