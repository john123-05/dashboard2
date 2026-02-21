/*\n  # Allow Public Read Access to Customer Data\n\n  This migration adds policies to allow reading customer, photo, and purchase data\n  without authentication restrictions. This is needed for the read-only dashboard.\n\n  1. Security Changes\n    - Add policy to allow reading all customers\n    - Add policy to allow reading all photos\n    - Add policy to allow reading all purchases\n*/\n\n-- Drop existing restrictive policies if they exist\nDROP POLICY IF EXISTS "Allow public read access to customers" ON customers;
\nDROP POLICY IF EXISTS "Allow public read access to photos" ON photos;
\nDROP POLICY IF EXISTS "Allow public read access to purchases" ON purchases;
\nDROP POLICY IF EXISTS "Allow public read access to leads" ON leads;
\n\n-- Allow reading all customers\nCREATE POLICY "Allow public read access to customers"\n  ON customers\n  FOR SELECT\n  TO public\n  USING (true);
\n\n-- Allow reading all photos\nCREATE POLICY "Allow public read access to photos"\n  ON photos\n  FOR SELECT\n  TO public\n  USING (true);
\n\n-- Allow reading all purchases\nCREATE POLICY "Allow public read access to purchases"\n  ON purchases\n  FOR SELECT\n  TO public\n  USING (true);
\n\n-- Allow reading all leads\nCREATE POLICY "Allow public read access to leads"\n  ON leads\n  FOR SELECT\n  TO public\n  USING (true);
;
