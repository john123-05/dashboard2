-- H1 (docs/PRODUKT_PLAN.md): Rechte je Seite für Mitarbeiter.
-- OPERATOR-Projekt (xcrxltiiovpoladpaewd), nicht das shared-Projekt.
alter table public.organization_memberships
  add column if not exists allowed_pages text[],        -- null = Standard der Rolle
  add column if not exists role_label text,             -- Anzeigename der Vorlage, z. B. 'Buchhaltung'
  add column if not exists disabled_at timestamptz;
