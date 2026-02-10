/*
  # Allow Public Read Access to Customer Data

  This migration adds policies to allow reading customer, photo, and purchase data
  without authentication restrictions. This is needed for the read-only dashboard.

  1. Security Changes
    - Add policy to allow reading all customers
    - Add policy to allow reading all photos
    - Add policy to allow reading all purchases
*/

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Allow public read access to customers" ON customers;
DROP POLICY IF EXISTS "Allow public read access to photos" ON photos;
DROP POLICY IF EXISTS "Allow public read access to purchases" ON purchases;
DROP POLICY IF EXISTS "Allow public read access to leads" ON leads;

-- Allow reading all customers
CREATE POLICY "Allow public read access to customers"
  ON customers
  FOR SELECT
  TO public
  USING (true);

-- Allow reading all photos
CREATE POLICY "Allow public read access to photos"
  ON photos
  FOR SELECT
  TO public
  USING (true);

-- Allow reading all purchases
CREATE POLICY "Allow public read access to purchases"
  ON purchases
  FOR SELECT
  TO public
  USING (true);

-- Allow reading all leads
CREATE POLICY "Allow public read access to leads"
  ON leads
  FOR SELECT
  TO public
  USING (true);