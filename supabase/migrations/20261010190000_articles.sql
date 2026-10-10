-- G1 (docs/PRODUKT_PLAN.md): Ratgeber-Artikel. Shared-Projekt kvpcwlcfgmsmarjtwpsx.
-- Bearbeitet im Liftpictures-CRM (Seite „Ratgeber“, Staff = is_crm_admin), gelesen vom Betreiber-Dashboard
-- über die Function operator-articles (Service Role, nur veröffentlichte Artikel).
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  excerpt text not null default '',
  body text not null default '',
  lang text not null default 'de' check (lang ~ '^[a-z]{2}$'),
  cover_url text,
  cover_alt text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists articles_published_idx on public.articles (status, published_at desc);

alter table public.articles enable row level security;
drop policy if exists "articles admin all" on public.articles;
create policy "articles admin all" on public.articles
  for all to authenticated using (public.is_crm_admin()) with check (public.is_crm_admin());

-- Titelbilder (öffentlich lesbar, Schreiben nur über den Staff-Login im CRM)
insert into storage.buckets (id, name, public) values ('ratgeber', 'ratgeber', true) on conflict (id) do nothing;
drop policy if exists "ratgeber public read" on storage.objects;
create policy "ratgeber public read" on storage.objects for select using (bucket_id = 'ratgeber');
drop policy if exists "ratgeber admin write" on storage.objects;
create policy "ratgeber admin write" on storage.objects for all to authenticated
  using (bucket_id = 'ratgeber' and public.is_crm_admin()) with check (bucket_id = 'ratgeber' and public.is_crm_admin());
