-- F1: Versand-Takt. Läuft jede Minute und ruft park-email-dispatch auf.
-- VOR DEM AUSFÜHREN: <GEHEIMNIS> durch den Wert von EMAIL_LINK_SECRET ersetzen (nur im SQL-Editor, nicht ins Repo!).
-- Voraussetzung: Erweiterungen pg_cron und pg_net sind aktiv (Dashboard → Database → Extensions).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'park-email-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://kvpcwlcfgmsmarjtwpsx.supabase.co/functions/v1/park-email-dispatch',
    headers := '{"Content-Type": "application/json", "x-dispatch-secret": "<GEHEIMNIS>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
