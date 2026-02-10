/*
  # Create Stripe Product Selections Table

  1. New Tables
    - `stripe_product_selections`
      - `id` (uuid, primary key) - Unique identifier for each selection
      - `organization_id` (uuid, foreign key) - References the organization that made the selection
      - `price_id` (text) - The Stripe price ID selected
      - `product_id` (text) - The Stripe product ID associated with the price
      - `created_at` (timestamptz) - When the selection was made
      - `created_by` (uuid, foreign key) - References the user who made the selection

  2. Security
    - Enable RLS on `stripe_product_selections` table
    - Add policy for authenticated users to read selections for their organization
    - Add policy for authenticated users to insert selections for their organization
    - Add policy for authenticated users to delete selections for their organization

  3. Indexes
    - Index on `organization_id` for faster lookups
    - Unique constraint on `organization_id, price_id` to prevent duplicates
*/

CREATE TABLE IF NOT EXISTS stripe_product_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  price_id text NOT NULL,
  product_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES operator_profiles(id) ON DELETE SET NULL,
  UNIQUE(organization_id, price_id)
);

CREATE INDEX IF NOT EXISTS idx_stripe_product_selections_org_id 
  ON stripe_product_selections(organization_id);

ALTER TABLE stripe_product_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read product selections for their organization"
  ON stripe_product_selections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.organization_id = stripe_product_selections.organization_id
      AND organization_memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert product selections for their organization"
  ON stripe_product_selections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.organization_id = stripe_product_selections.organization_id
      AND organization_memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete product selections for their organization"
  ON stripe_product_selections
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.organization_id = stripe_product_selections.organization_id
      AND organization_memberships.user_id = auth.uid()
    )
  );
