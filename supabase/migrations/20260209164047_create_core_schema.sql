/*
  # Liftpictures Operator Dashboard - Core Schema

  1. New Tables
    - `organizations`
      - `id` (uuid, primary key) - Unique org identifier
      - `name` (text) - Organization display name
      - `slug` (text, unique) - URL-friendly identifier
      - `logo_url` (text) - Organization logo
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

    - `parks`
      - `id` (uuid, primary key)
      - `organization_id` (uuid, FK -> organizations)
      - `name` (text) - Park display name
      - `slug` (text) - URL-friendly identifier
      - `location` (text) - Physical location
      - `timezone` (text) - Park timezone
      - `created_at`, `updated_at` (timestamptz)

    - `attractions`
      - `id` (uuid, primary key)
      - `park_id` (uuid, FK -> parks)
      - `name` (text) - Attraction name
      - `type` (text) - Type: ride, gondola, coaster, walk, etc.
      - `status` (text) - active, inactive, maintenance
      - `created_at`, `updated_at` (timestamptz)

    - `operator_profiles`
      - `id` (uuid, PK, FK -> auth.users)
      - `email` (text) - Operator email
      - `full_name` (text) - Display name
      - `avatar_url` (text) - Profile picture
      - `created_at`, `updated_at` (timestamptz)

    - `organization_memberships`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK -> operator_profiles)
      - `organization_id` (uuid, FK -> organizations)
      - `role` (text) - RBAC role with CHECK constraint
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on all tables
    - Helper functions for membership checks
    - Trigger to auto-create operator profile on auth signup

  3. Notes
    - Roles: platform_admin, org_owner, park_manager, marketing, support_agent
    - Multi-tenant: operators only see data for their assigned organizations
*/

-- Organizations (top-level tenants)
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  logo_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Parks belonging to organizations
CREATE TABLE IF NOT EXISTS parks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  location text,
  timezone text DEFAULT 'UTC',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, slug)
);

-- Attractions within parks
CREATE TABLE IF NOT EXISTS attractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  park_id uuid NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text DEFAULT 'ride',
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_attraction_status CHECK (status IN ('active', 'inactive', 'maintenance'))
);

-- Operator profiles linked to auth.users
CREATE TABLE IF NOT EXISTS operator_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Organization memberships (RBAC)
CREATE TABLE IF NOT EXISTS organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES operator_profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'park_manager',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, organization_id),
  CONSTRAINT valid_role CHECK (role IN ('platform_admin', 'org_owner', 'park_manager', 'marketing', 'support_agent'))
);

-- Enable RLS on all core tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE parks ENABLE ROW LEVEL SECURITY;
ALTER TABLE attractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;

-- Helper function: check if current user is member of an organization
CREATE OR REPLACE FUNCTION is_org_member(org_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = org_id
    AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if current user is operator for a park
CREATE OR REPLACE FUNCTION is_park_operator(p_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM parks p
    JOIN organization_memberships om ON om.organization_id = p.organization_id
    WHERE p.id = p_id
    AND om.user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if current user is operator for an attraction
CREATE OR REPLACE FUNCTION is_attraction_operator(a_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM attractions a
    JOIN parks p ON p.id = a.park_id
    JOIN organization_memberships om ON om.organization_id = p.organization_id
    WHERE a.id = a_id
    AND om.user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS Policies: organizations
CREATE POLICY "Operators can view their organizations"
  ON organizations FOR SELECT
  TO authenticated
  USING (is_org_member(id));

-- RLS Policies: parks
CREATE POLICY "Operators can view parks in their orgs"
  ON parks FOR SELECT
  TO authenticated
  USING (is_org_member(organization_id));

-- RLS Policies: attractions
CREATE POLICY "Operators can view attractions in their parks"
  ON attractions FOR SELECT
  TO authenticated
  USING (is_park_operator(park_id));

-- RLS Policies: operator_profiles
CREATE POLICY "Operators can view own profile"
  ON operator_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Operators can update own profile"
  ON operator_profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Operators can insert own profile"
  ON operator_profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- RLS Policies: organization_memberships
CREATE POLICY "Operators can view own memberships"
  ON organization_memberships FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Trigger: auto-create operator profile on auth signup
CREATE OR REPLACE FUNCTION handle_new_operator()
RETURNS trigger AS $$
BEGIN
  INSERT INTO operator_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_operator();

-- Function: join demo organization (for development)
CREATE OR REPLACE FUNCTION join_demo_organization()
RETURNS void AS $$
DECLARE
  demo_org_id uuid;
BEGIN
  SELECT id INTO demo_org_id FROM organizations WHERE slug = 'alpine-adventures' LIMIT 1;
  IF demo_org_id IS NOT NULL THEN
    INSERT INTO organization_memberships (user_id, organization_id, role)
    VALUES (auth.uid(), demo_org_id, 'org_owner')
    ON CONFLICT (user_id, organization_id) DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_parks_org_id ON parks(organization_id);
CREATE INDEX IF NOT EXISTS idx_attractions_park_id ON attractions(park_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user_id ON organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org_id ON organization_memberships(organization_id);