-- PK9 (docs/AUSBAU_PLAN.md): Preiskarten „für wen“ und Anpassungen je Kunde.
-- Shared-Projekt kvpcwlcfgmsmarjtwpsx.
-- - catalog_packages.audience: wer die Karte sieht – {"all": true} oder {"park_ids": ["…"]}
-- - park_price_overrides.bullets: eigene „Das ist dabei / nicht dabei“-Liste für diesen Kunden (null = Standard)
-- - park_price_overrides.hidden: Karte für diesen Kunden ausblenden
alter table public.catalog_packages add column if not exists audience jsonb not null default '{"all": true}'::jsonb;
alter table public.park_price_overrides add column if not exists bullets jsonb;
alter table public.park_price_overrides add column if not exists hidden boolean not null default false;
