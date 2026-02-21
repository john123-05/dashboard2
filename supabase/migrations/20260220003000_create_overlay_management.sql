/*
  # Overlay Management (Dashboard Source of Truth)

  1. New Tables
    - overlay_assets
    - overlay_campaigns
    - overlay_campaign_layers

  2. Storage
    - private bucket: overlays

  3. Security
    - RLS on overlay tables
    - storage policies scoped by park UUID in object path prefix
*/

-- Assets stored in a private storage bucket and scoped to a park
CREATE TABLE IF NOT EXISTS overlay_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  park_id uuid NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  bucket text NOT NULL DEFAULT 'overlays',
  path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  width integer,
  height integer,
  created_by uuid NOT NULL REFERENCES operator_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Campaign windows for selecting overlays by park + time
CREATE TABLE IF NOT EXISTS overlay_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  park_id uuid NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  priority integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_overlay_campaign_status CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT valid_overlay_campaign_range CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

-- Ordered layers assigned to each campaign
CREATE TABLE IF NOT EXISTS overlay_campaign_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES overlay_campaigns(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES overlay_assets(id) ON DELETE CASCADE,
  z_index integer NOT NULL DEFAULT 10,
  opacity numeric(3,2) NOT NULL DEFAULT 1.00,
  blend_mode text NOT NULL DEFAULT 'normal',
  fit text NOT NULL DEFAULT 'contain',
  anchor text NOT NULL DEFAULT 'center',
  scale numeric(4,2) NOT NULL DEFAULT 1.00,
  CONSTRAINT valid_overlay_layer_opacity CHECK (opacity >= 0 AND opacity <= 1),
  CONSTRAINT valid_overlay_layer_scale CHECK (scale > 0 AND scale <= 3),
  CONSTRAINT valid_overlay_layer_fit CHECK (fit IN ('contain', 'cover', 'fill')),
  CONSTRAINT valid_overlay_layer_anchor CHECK (anchor IN (
    'center',
    'top_left',
    'top',
    'top_right',
    'left',
    'right',
    'bottom_left',
    'bottom',
    'bottom_right'
  )),
  CONSTRAINT valid_overlay_layer_blend_mode CHECK (blend_mode IN (
    'normal',
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
    'color-dodge',
    'color-burn',
    'hard-light',
    'soft-light'
  )),
  CONSTRAINT unique_overlay_asset_per_campaign UNIQUE (campaign_id, asset_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_overlay_assets_park_id
  ON overlay_assets(park_id);
CREATE INDEX IF NOT EXISTS idx_overlay_campaigns_park_status_starts
  ON overlay_campaigns(park_id, status, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_overlay_campaign_layers_campaign_z
  ON overlay_campaign_layers(campaign_id, z_index ASC);

-- RLS
ALTER TABLE overlay_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE overlay_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE overlay_campaign_layers ENABLE ROW LEVEL SECURITY;

-- overlay_assets
DROP POLICY IF EXISTS "Operators can view overlay assets for their parks" ON overlay_assets;
CREATE POLICY "Operators can view overlay assets for their parks"
  ON overlay_assets FOR SELECT
  TO authenticated
  USING (is_park_operator(park_id));

DROP POLICY IF EXISTS "Operators can create overlay assets for their parks" ON overlay_assets;
CREATE POLICY "Operators can create overlay assets for their parks"
  ON overlay_assets FOR INSERT
  TO authenticated
  WITH CHECK (
    is_park_operator(park_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Operators can update overlay assets for their parks" ON overlay_assets;
CREATE POLICY "Operators can update overlay assets for their parks"
  ON overlay_assets FOR UPDATE
  TO authenticated
  USING (is_park_operator(park_id))
  WITH CHECK (is_park_operator(park_id));

DROP POLICY IF EXISTS "Operators can delete overlay assets for their parks" ON overlay_assets;
CREATE POLICY "Operators can delete overlay assets for their parks"
  ON overlay_assets FOR DELETE
  TO authenticated
  USING (is_park_operator(park_id));

-- overlay_campaigns
DROP POLICY IF EXISTS "Operators can view overlay campaigns for their parks" ON overlay_campaigns;
CREATE POLICY "Operators can view overlay campaigns for their parks"
  ON overlay_campaigns FOR SELECT
  TO authenticated
  USING (is_park_operator(park_id));

DROP POLICY IF EXISTS "Operators can create overlay campaigns for their parks" ON overlay_campaigns;
CREATE POLICY "Operators can create overlay campaigns for their parks"
  ON overlay_campaigns FOR INSERT
  TO authenticated
  WITH CHECK (is_park_operator(park_id));

DROP POLICY IF EXISTS "Operators can update overlay campaigns for their parks" ON overlay_campaigns;
CREATE POLICY "Operators can update overlay campaigns for their parks"
  ON overlay_campaigns FOR UPDATE
  TO authenticated
  USING (is_park_operator(park_id))
  WITH CHECK (is_park_operator(park_id));

DROP POLICY IF EXISTS "Operators can delete overlay campaigns for their parks" ON overlay_campaigns;
CREATE POLICY "Operators can delete overlay campaigns for their parks"
  ON overlay_campaigns FOR DELETE
  TO authenticated
  USING (is_park_operator(park_id));

-- overlay_campaign_layers
DROP POLICY IF EXISTS "Operators can view campaign layers for their parks" ON overlay_campaign_layers;
CREATE POLICY "Operators can view campaign layers for their parks"
  ON overlay_campaign_layers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM overlay_campaigns c
      WHERE c.id = overlay_campaign_layers.campaign_id
        AND is_park_operator(c.park_id)
    )
  );

DROP POLICY IF EXISTS "Operators can create campaign layers for their parks" ON overlay_campaign_layers;
CREATE POLICY "Operators can create campaign layers for their parks"
  ON overlay_campaign_layers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM overlay_campaigns c
      JOIN overlay_assets a ON a.id = overlay_campaign_layers.asset_id
      WHERE c.id = overlay_campaign_layers.campaign_id
        AND a.park_id = c.park_id
        AND is_park_operator(c.park_id)
    )
  );

DROP POLICY IF EXISTS "Operators can update campaign layers for their parks" ON overlay_campaign_layers;
CREATE POLICY "Operators can update campaign layers for their parks"
  ON overlay_campaign_layers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM overlay_campaigns c
      JOIN overlay_assets a ON a.id = overlay_campaign_layers.asset_id
      WHERE c.id = overlay_campaign_layers.campaign_id
        AND a.park_id = c.park_id
        AND is_park_operator(c.park_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM overlay_campaigns c
      JOIN overlay_assets a ON a.id = overlay_campaign_layers.asset_id
      WHERE c.id = overlay_campaign_layers.campaign_id
        AND a.park_id = c.park_id
        AND is_park_operator(c.park_id)
    )
  );

DROP POLICY IF EXISTS "Operators can delete campaign layers for their parks" ON overlay_campaign_layers;
CREATE POLICY "Operators can delete campaign layers for their parks"
  ON overlay_campaign_layers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM overlay_campaigns c
      WHERE c.id = overlay_campaign_layers.campaign_id
        AND is_park_operator(c.park_id)
    )
  );

-- Private storage bucket for overlays
INSERT INTO storage.buckets (id, name, public)
VALUES ('overlays', 'overlays', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

-- Storage policies scoped by first path segment == park UUID
DROP POLICY IF EXISTS "Operators can read overlay objects for their parks" ON storage.objects;
CREATE POLICY "Operators can read overlay objects for their parks"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'overlays'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND is_park_operator((split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS "Operators can upload overlay objects for their parks" ON storage.objects;
CREATE POLICY "Operators can upload overlay objects for their parks"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'overlays'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND is_park_operator((split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS "Operators can update overlay objects for their parks" ON storage.objects;
CREATE POLICY "Operators can update overlay objects for their parks"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'overlays'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND is_park_operator((split_part(name, '/', 1))::uuid)
  )
  WITH CHECK (
    bucket_id = 'overlays'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND is_park_operator((split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS "Operators can delete overlay objects for their parks" ON storage.objects;
CREATE POLICY "Operators can delete overlay objects for their parks"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'overlays'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND is_park_operator((split_part(name, '/', 1))::uuid)
  );
