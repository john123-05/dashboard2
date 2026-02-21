/*
  # Support Sync Webhooks (Source Project -> Target Dashboard)

  This migration adds outbound database webhooks for:
  - public.support_tickets
  - public.support_ticket_messages

  The webhook payload matches Supabase webhook event shape:
  {
    type: "INSERT" | "UPDATE" | "DELETE",
    table: "...",
    schema: "public",
    record: {...} | null,
    old_record: {...} | null
  }
*/

-- Optional async HTTP fallback extension
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Singleton config row (keeps URL/secret out of migration code)
CREATE TABLE IF NOT EXISTS public.support_sync_webhook_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  target_url text NOT NULL,
  sync_secret text NOT NULL,
  timeout_ms integer NOT NULL DEFAULT 5000 CHECK (timeout_ms > 0 AND timeout_ms <= 60000),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.support_sync_webhook_config (
  id,
  target_url,
  sync_secret,
  timeout_ms,
  enabled
)
VALUES (
  true,
  'https://<TARGET_DASHBOARD_DOMAIN>/api/support-sync',
  '<SUPPORT_SYNC_SECRET>',
  5000,
  false
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.support_sync_webhook_config ENABLE ROW LEVEL SECURITY;

-- Intentionally no policies. Only privileged roles should read/write this table.

CREATE OR REPLACE FUNCTION public.set_support_sync_webhook_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_sync_webhook_config_updated_at
  ON public.support_sync_webhook_config;
CREATE TRIGGER trg_support_sync_webhook_config_updated_at
  BEFORE UPDATE ON public.support_sync_webhook_config
  FOR EACH ROW
  EXECUTE FUNCTION public.set_support_sync_webhook_updated_at();

-- Fallback trigger function using pg_net.
-- Used when supabase_functions.http_request trigger function is not available.
CREATE OR REPLACE FUNCTION public.dispatch_support_sync_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.support_sync_webhook_config%ROWTYPE;
  payload jsonb;
  headers jsonb;
BEGIN
  SELECT *
  INTO cfg
  FROM public.support_sync_webhook_config
  WHERE id = true;

  IF NOT FOUND OR cfg.enabled IS NOT true THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END
  );

  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-support-sync-secret', cfg.sync_secret,
    'Authorization', 'Bearer ' || cfg.sync_secret
  );

  PERFORM net.http_post(
    url := cfg.target_url,
    headers := headers,
    body := payload,
    timeout_milliseconds := cfg.timeout_ms
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Rebuilds triggers with either:
-- 1) supabase_functions.http_request (preferred, if available)
-- 2) dispatch_support_sync_webhook fallback
CREATE OR REPLACE FUNCTION public.rebuild_support_sync_webhooks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.support_sync_webhook_config%ROWTYPE;
  has_supabase_webhook boolean;
  headers_text text;
BEGIN
  SELECT *
  INTO cfg
  FROM public.support_sync_webhook_config
  WHERE id = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_sync_webhook_config row is missing';
  END IF;

  DROP TRIGGER IF EXISTS trg_support_tickets_sync_webhook
    ON public.support_tickets;
  DROP TRIGGER IF EXISTS trg_support_ticket_messages_sync_webhook
    ON public.support_ticket_messages;

  IF cfg.enabled IS NOT true THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'supabase_functions'
      AND p.proname = 'http_request'
      AND p.prorettype = 'pg_catalog.trigger'::regtype
  )
  INTO has_supabase_webhook;

  IF has_supabase_webhook THEN
    headers_text := json_build_object(
      'Content-Type', 'application/json',
      'x-support-sync-secret', cfg.sync_secret,
      'Authorization', 'Bearer ' || cfg.sync_secret
    )::text;

    EXECUTE format(
      $sql$
      CREATE TRIGGER trg_support_tickets_sync_webhook
      AFTER INSERT OR UPDATE OR DELETE ON public.support_tickets
      FOR EACH ROW
      EXECUTE FUNCTION supabase_functions.http_request(%L, %L, %L, %L, %L)
      $sql$,
      cfg.target_url,
      'POST',
      headers_text,
      '{}'::text,
      cfg.timeout_ms::text
    );

    EXECUTE format(
      $sql$
      CREATE TRIGGER trg_support_ticket_messages_sync_webhook
      AFTER INSERT OR UPDATE OR DELETE ON public.support_ticket_messages
      FOR EACH ROW
      EXECUTE FUNCTION supabase_functions.http_request(%L, %L, %L, %L, %L)
      $sql$,
      cfg.target_url,
      'POST',
      headers_text,
      '{}'::text,
      cfg.timeout_ms::text
    );
  ELSE
    CREATE TRIGGER trg_support_tickets_sync_webhook
      AFTER INSERT OR UPDATE OR DELETE ON public.support_tickets
      FOR EACH ROW
      EXECUTE FUNCTION public.dispatch_support_sync_webhook();

    CREATE TRIGGER trg_support_ticket_messages_sync_webhook
      AFTER INSERT OR UPDATE OR DELETE ON public.support_ticket_messages
      FOR EACH ROW
      EXECUTE FUNCTION public.dispatch_support_sync_webhook();
  END IF;
END;
$$;

-- One-step configurator for target URL + secret.
CREATE OR REPLACE FUNCTION public.configure_support_sync_webhooks(
  p_target_url text,
  p_sync_secret text,
  p_timeout_ms integer DEFAULT 5000,
  p_enabled boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_target_url IS NULL OR btrim(p_target_url) = '' THEN
    RAISE EXCEPTION 'p_target_url is required';
  END IF;

  IF p_sync_secret IS NULL OR btrim(p_sync_secret) = '' THEN
    RAISE EXCEPTION 'p_sync_secret is required';
  END IF;

  INSERT INTO public.support_sync_webhook_config (
    id,
    target_url,
    sync_secret,
    timeout_ms,
    enabled
  )
  VALUES (
    true,
    btrim(p_target_url),
    btrim(p_sync_secret),
    COALESCE(p_timeout_ms, 5000),
    COALESCE(p_enabled, true)
  )
  ON CONFLICT (id) DO UPDATE
  SET target_url = EXCLUDED.target_url,
      sync_secret = EXCLUDED.sync_secret,
      timeout_ms = EXCLUDED.timeout_ms,
      enabled = EXCLUDED.enabled,
      updated_at = now();

  PERFORM public.rebuild_support_sync_webhooks();
END;
$$;

REVOKE ALL ON FUNCTION public.configure_support_sync_webhooks(text, text, integer, boolean)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.rebuild_support_sync_webhooks()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.dispatch_support_sync_webhook()
  FROM PUBLIC, anon, authenticated;

-- Apply current config (starts disabled with placeholder defaults).
SELECT public.rebuild_support_sync_webhooks();
