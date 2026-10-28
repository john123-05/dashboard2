-- Geteiltes Projekt kvpcwlcfgmsmarjtwpsx: weitere Mitteilungsarten pro Benutzer und Park.
-- updates_enabled: „Neue Version verfügbar“ und ähnliche Hinweise aus dem CRM (Kategorie update).
-- news_enabled: Informationen zu neuen Produkten und Angeboten aus dem CRM (Kategorie info).
alter table public.operator_notification_preferences
  add column if not exists updates_enabled boolean not null default true,
  add column if not exists news_enabled boolean not null default true;
