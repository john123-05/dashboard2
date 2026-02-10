/*
  # Liftpictures App Data Tables

  These tables represent the core Liftpictures application data that
  the operator dashboard reads from (scoped by organization membership).

  1. New Tables
    - `customers`
      - `id` (uuid, PK) - Customer identifier
      - `email` (text) - Customer email
      - `full_name` (text) - Display name
      - `phone` (text) - Phone number
      - `opted_in_marketing` (boolean) - Marketing consent flag
      - `created_at` (timestamptz)

    - `photos`
      - `id` (uuid, PK)
      - `attraction_id` (uuid, FK -> attractions) - Where photo was taken
      - `customer_id` (uuid, FK -> customers) - Linked customer (nullable)
      - `image_url` (text) - Full image URL
      - `thumbnail_url` (text) - Thumbnail URL
      - `taken_at` (timestamptz) - When photo was captured
      - `status` (text) - available, purchased, expired
      - `metadata` (jsonb) - Additional photo metadata

    - `purchases`
      - `id` (uuid, PK)
      - `photo_id` (uuid, FK -> photos)
      - `customer_id` (uuid, FK -> customers)
      - `amount_cents` (integer) - Price in cents
      - `currency` (text) - Currency code
      - `stripe_payment_id` (text) - Stripe reference
      - `status` (text) - completed, refunded, pending
      - `purchased_at` (timestamptz)

    - `leads`
      - `id` (uuid, PK)
      - `park_id` (uuid, FK -> parks)
      - `email` (text) - Lead email
      - `full_name` (text) - Lead name
      - `source` (text) - Acquisition source
      - `opted_in` (boolean) - Opt-in consent
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on all tables
    - Operators can only SELECT data for their assigned orgs
    - No INSERT/UPDATE/DELETE for operators on app data
*/

-- Customers (end users who buy photos)
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  full_name text,
  phone text,
  opted_in_marketing boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Photos captured at attractions
CREATE TABLE IF NOT EXISTS photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attraction_id uuid NOT NULL REFERENCES attractions(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id),
  image_url text NOT NULL,
  thumbnail_url text,
  taken_at timestamptz DEFAULT now(),
  status text DEFAULT 'available',
  metadata jsonb DEFAULT '{}',
  CONSTRAINT valid_photo_status CHECK (status IN ('available', 'purchased', 'expired'))
);

-- Purchases of photos
CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text DEFAULT 'usd',
  stripe_payment_id text,
  status text DEFAULT 'completed',
  purchased_at timestamptz DEFAULT now(),
  CONSTRAINT valid_purchase_status CHECK (status IN ('completed', 'refunded', 'pending'))
);

-- Marketing leads
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  park_id uuid NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  source text DEFAULT 'website',
  opted_in boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- RLS: Customers - operators can view customers who have photos at their attractions
CREATE POLICY "Operators can view customers in their scope"
  ON customers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM photos ph
      WHERE ph.customer_id = customers.id
      AND is_attraction_operator(ph.attraction_id)
    )
    OR
    EXISTS (
      SELECT 1 FROM purchases pu
      JOIN photos ph ON ph.id = pu.photo_id
      WHERE pu.customer_id = customers.id
      AND is_attraction_operator(ph.attraction_id)
    )
  );

-- RLS: Photos - operators can view photos at their attractions
CREATE POLICY "Operators can view photos at their attractions"
  ON photos FOR SELECT
  TO authenticated
  USING (is_attraction_operator(attraction_id));

-- RLS: Purchases - operators can view purchases for their attractions
CREATE POLICY "Operators can view purchases for their attractions"
  ON purchases FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM photos ph
      WHERE ph.id = purchases.photo_id
      AND is_attraction_operator(ph.attraction_id)
    )
  );

-- RLS: Leads - operators can view leads for their parks
CREATE POLICY "Operators can view leads for their parks"
  ON leads FOR SELECT
  TO authenticated
  USING (is_park_operator(park_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_photos_attraction_id ON photos(attraction_id);
CREATE INDEX IF NOT EXISTS idx_photos_customer_id ON photos(customer_id);
CREATE INDEX IF NOT EXISTS idx_photos_taken_at ON photos(taken_at);
CREATE INDEX IF NOT EXISTS idx_purchases_photo_id ON purchases(photo_id);
CREATE INDEX IF NOT EXISTS idx_purchases_customer_id ON purchases(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_purchased_at ON purchases(purchased_at);
CREATE INDEX IF NOT EXISTS idx_leads_park_id ON leads(park_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);