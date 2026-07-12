/*
  # Park Feature Settings + Operations Snapshots

  This migration prepares the dashboard for park-specific modules and
  cached operational data derived from uploaded machine/log files.

  New tables:
  - park_feature_settings
  - park_operations_snapshots
*/

CREATE OR REPLACE FUNCTION public.set_generic_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.park_feature_settings (
  park_id uuid PRIMARY KEY REFERENCES public.parks(id) ON DELETE CASCADE,
  stripe_mode text NOT NULL DEFAULT 'auto',
  local_sales_mode text NOT NULL DEFAULT 'auto',
  operations_mode text NOT NULL DEFAULT 'auto',
  health_mode text NOT NULL DEFAULT 'auto',
  errors_mode text NOT NULL DEFAULT 'auto',
  operations_source text NOT NULL DEFAULT 'external_storage',
  operations_bucket text NOT NULL DEFAULT 'daten',
  operations_prefix text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_park_feature_mode_stripe CHECK (stripe_mode IN ('auto', 'enabled', 'disabled')),
  CONSTRAINT valid_park_feature_mode_local_sales CHECK (local_sales_mode IN ('auto', 'enabled', 'disabled')),
  CONSTRAINT valid_park_feature_mode_operations CHECK (operations_mode IN ('auto', 'enabled', 'disabled')),
  CONSTRAINT valid_park_feature_mode_health CHECK (health_mode IN ('auto', 'enabled', 'disabled')),
  CONSTRAINT valid_park_feature_mode_errors CHECK (errors_mode IN ('auto', 'enabled', 'disabled')),
  CONSTRAINT valid_park_feature_source CHECK (operations_source IN ('external_storage', 'dashboard_storage'))
);

CREATE TABLE IF NOT EXISTS public.park_operations_snapshots (
  park_id uuid PRIMARY KEY REFERENCES public.parks(id) ON DELETE CASCADE,
  source_kind text NOT NULL DEFAULT 'external_storage',
  source_bucket text NOT NULL DEFAULT 'daten',
  source_prefix text,
  latest_object_at timestamptz,
  latest_event_at timestamptz,
  fingerprint text,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  sales jsonb NOT NULL DEFAULT '{}'::jsonb,
  health jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  operations jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_park_operations_source_kind CHECK (source_kind IN ('external_storage', 'dashboard_storage'))
);

CREATE INDEX IF NOT EXISTS idx_park_feature_settings_bucket
  ON public.park_feature_settings(operations_bucket);

CREATE INDEX IF NOT EXISTS idx_park_operations_snapshots_latest_object_at
  ON public.park_operations_snapshots(latest_object_at DESC);

ALTER TABLE public.park_feature_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.park_operations_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operators can view park feature settings" ON public.park_feature_settings;
CREATE POLICY "Operators can view park feature settings"
  ON public.park_feature_settings
  FOR SELECT
  TO authenticated
  USING (public.is_park_operator(park_id));

DROP POLICY IF EXISTS "Operators can manage park feature settings" ON public.park_feature_settings;
CREATE POLICY "Operators can manage park feature settings"
  ON public.park_feature_settings
  FOR ALL
  TO authenticated
  USING (public.is_park_operator(park_id))
  WITH CHECK (public.is_park_operator(park_id));

DROP POLICY IF EXISTS "Operators can view park operation snapshots" ON public.park_operations_snapshots;
CREATE POLICY "Operators can view park operation snapshots"
  ON public.park_operations_snapshots
  FOR SELECT
  TO authenticated
  USING (public.is_park_operator(park_id));

DROP TRIGGER IF EXISTS trg_park_feature_settings_updated_at ON public.park_feature_settings;
CREATE TRIGGER trg_park_feature_settings_updated_at
  BEFORE UPDATE ON public.park_feature_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_generic_updated_at();

DROP TRIGGER IF EXISTS trg_park_operations_snapshots_updated_at ON public.park_operations_snapshots;
CREATE TRIGGER trg_park_operations_snapshots_updated_at
  BEFORE UPDATE ON public.park_operations_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.set_generic_updated_at();

INSERT INTO public.park_feature_settings (park_id)
SELECT p.id
FROM public.parks p
ON CONFLICT (park_id) DO NOTHING;
