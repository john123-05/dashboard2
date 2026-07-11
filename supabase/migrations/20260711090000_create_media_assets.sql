-- Media library: searchable catalog of marketing/reference media (customers,
-- hardware, software, attractions). Read-only from the client; rows are
-- populated via a one-off import script running with service-role access,
-- not through any client-facing insert/update/delete path.

CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  subcategory text,
  keywords text[] NOT NULL DEFAULT '{}',
  storage_path text NOT NULL UNIQUE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  file_size_bytes bigint,
  source_folder text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_category ON media_assets (category);
CREATE INDEX IF NOT EXISTS idx_media_assets_keywords ON media_assets USING gin (keywords);

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to media_assets"
  ON media_assets
  FOR SELECT
  TO public
  USING (true);
