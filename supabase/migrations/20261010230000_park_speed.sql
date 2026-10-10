-- SP1 (docs/AUSBAU_PLAN.md): Speedmessung dauerhaft speichern (Woche/Monat/Allzeit) + Einstellungen je Park.
-- Shared-Projekt kvpcwlcfgmsmarjtwpsx. Nur Service Role (Edge Functions).
create table if not exists public.park_speed_results (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  photo_id uuid not null,            -- bewusst ohne Fremdschlüssel: Fotos werden später gelöscht
  claim_id uuid,
  email text not null,               -- klein geschrieben; ohne Adresse 'claim:<id>'
  speed_kmh numeric not null,
  captured_at timestamptz not null,
  day date not null,                 -- Kalendertag in Park-Zeit
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (park_id, photo_id, email)
);
create index if not exists park_speed_results_rank_idx on public.park_speed_results (park_id, day, speed_kmh desc);
create index if not exists park_speed_results_all_idx on public.park_speed_results (park_id, speed_kmh desc);

create table if not exists public.park_speed_settings (
  park_id uuid primary key references public.parks(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.park_speed_results enable row level security;
alter table public.park_speed_settings enable row level security;
revoke all on table public.park_speed_results, public.park_speed_settings from public, anon, authenticated;

-- Jede freigeschaltete Fahrt mit Messwert landet dauerhaft in park_speed_results. Fehler werden verschluckt:
-- eine Freischaltung darf nie daran scheitern.
create or replace function public.record_park_speed_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.status is distinct from 'claimed' then return new; end if;
    insert into public.park_speed_results (park_id, photo_id, claim_id, email, speed_kmh, captured_at, day)
    select new.park_id, p.id, new.id,
           coalesce(nullif(lower(trim(new.email)), ''), 'claim:' || new.id::text),
           p.speed_kmh, p.captured_at,
           (p.captured_at at time zone coalesce(pk.timezone, 'Europe/Berlin'))::date
      from public.photos p
      join public.parks pk on pk.id = p.park_id
     where p.id = new.photo_id
       and p.speed_kmh is not null and p.speed_kmh > 0
       and coalesce(p.is_test, false) = false
    on conflict (park_id, photo_id, email) do update set claim_id = excluded.claim_id;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists photo_claims_speed_result on public.photo_claims;
create trigger photo_claims_speed_result
  after insert or update of status, email on public.photo_claims
  for each row execute function public.record_park_speed_result();

-- Nachtrag: alle heute noch vorhandenen freigeschalteten Fahrten.
insert into public.park_speed_results (park_id, photo_id, claim_id, email, speed_kmh, captured_at, day)
select c.park_id, p.id, c.id,
       coalesce(nullif(lower(trim(c.email)), ''), 'claim:' || c.id::text),
       p.speed_kmh, p.captured_at,
       (p.captured_at at time zone coalesce(pk.timezone, 'Europe/Berlin'))::date
  from public.photo_claims c
  join public.photos p on p.id = c.photo_id
  join public.parks pk on pk.id = p.park_id
 where c.status = 'claimed'
   and p.speed_kmh is not null and p.speed_kmh > 0
   and coalesce(p.is_test, false) = false
on conflict (park_id, photo_id, email) do nothing;
