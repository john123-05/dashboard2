-- Storage bucket for the media_assets library. Public read (same as the
-- existing "test" bucket already used for Werbematerialien), no public
-- write policy — uploads happen via service-role import script only.

INSERT INTO storage.buckets (id, name, public)
VALUES ('media-library', 'media-library', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access to media-library bucket"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'media-library');
