/*
  # Schedule support-sync-outbound worker (every minute)

  This creates a lightweight scheduler in the source project:
  - cron job every minute
  - calls Edge Function `support-sync-outbound`
  - keeps settings in a singleton config row
*/

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE IF NOT EXISTS public.support_sync_scheduler_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  function_url text NOT NULL,
  sync_secret text,
  enabled boolean NOT NULL DEFAULT true,
  batch_limit integer NOT NULL DEFAULT 100 CHECK (batch_limit > 0 AND batch_limit <= 500),
  timeout_ms integer NOT NULL DEFAULT 5000 CHECK (timeout_ms > 0 AND timeout_ms <= 60000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.support_sync_scheduler_config (
  id,
  function_url,
  sync_secret,
  enabled,
  batch_limit,
  timeout_ms
)
VALUES (
  true,
  'https://xcrxltiiovpoladpaewd.supabase.co/functions/v1/support-sync-outbound',
  null,
  true,
  100,
  5000
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.support_sync_scheduler_config ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_support_sync_scheduler_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_sync_scheduler_config_updated_at
  ON public.support_sync_scheduler_config;
CREATE TRIGGER trg_support_sync_scheduler_config_updated_at
  BEFORE UPDATE ON public.support_sync_scheduler_config
  FOR EACH ROW
  EXECUTE FUNCTION public.set_support_sync_scheduler_updated_at();

CREATE OR REPLACE FUNCTION public.run_support_sync_outbound_job()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.support_sync_scheduler_config%ROWTYPE;
  headers jsonb;
BEGIN
  SELECT *
  INTO cfg
  FROM public.support_sync_scheduler_config
  WHERE id = true;

  IF NOT FOUND OR cfg.enabled IS NOT true THEN
    RETURN;
  END IF;

  headers := jsonb_build_object(
    'Content-Type', 'application/json'
  );

  IF cfg.sync_secret IS NOT NULL AND btrim(cfg.sync_secret) <> '' THEN
    headers := headers || jsonb_build_object(
      'X-Sync-Secret', cfg.sync_secret
    );
  END IF;

  PERFORM net.http_post(
    url := cfg.function_url,
    headers := headers,
    body := jsonb_build_object('limit', cfg.batch_limit),
    timeout_milliseconds := cfg.timeout_ms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_support_sync_outbound_job()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'support-sync-outbound-every-minute';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'support-sync-outbound-every-minute',
    '* * * * *',
    'select public.run_support_sync_outbound_job();'
  );
END;
$$;
