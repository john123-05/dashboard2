/*
  # Support Tickets and System Health Events

  1. New Tables
    - `support_tickets`
      - `id` (uuid, PK)
      - `organization_id` (uuid, FK -> organizations)
      - `created_by` (uuid, FK -> operator_profiles)
      - `subject` (text) - Ticket subject
      - `description` (text) - Ticket body
      - `status` (text) - open, in_progress, resolved, closed
      - `priority` (text) - low, medium, high, critical
      - `created_at`, `updated_at` (timestamptz)

    - `system_health_events`
      - `id` (uuid, PK)
      - `park_id` (uuid, FK -> parks) - Nullable for global events
      - `event_type` (text) - webhook, api_error, service, camera, etc.
      - `severity` (text) - info, warning, error, critical
      - `message` (text) - Human-readable event description
      - `metadata` (jsonb) - Additional event data
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on both tables
    - Support tickets: operators can CRUD for their orgs
    - Health events: operators can read events for their parks
*/

-- Support tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES operator_profiles(id),
  subject text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text DEFAULT 'open',
  priority text DEFAULT 'medium',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_ticket_status CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  CONSTRAINT valid_ticket_priority CHECK (priority IN ('low', 'medium', 'high', 'critical'))
);

-- System health events
CREATE TABLE IF NOT EXISTS system_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  park_id uuid REFERENCES parks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  severity text DEFAULT 'info',
  message text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_event_severity CHECK (severity IN ('info', 'warning', 'error', 'critical'))
);

-- Enable RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_health_events ENABLE ROW LEVEL SECURITY;

-- RLS: Support tickets
CREATE POLICY "Operators can view tickets for their orgs"
  ON support_tickets FOR SELECT
  TO authenticated
  USING (is_org_member(organization_id));

CREATE POLICY "Operators can create tickets for their orgs"
  ON support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (
    is_org_member(organization_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "Operators can update tickets for their orgs"
  ON support_tickets FOR UPDATE
  TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- RLS: System health events
CREATE POLICY "Operators can view health events for their parks"
  ON system_health_events FOR SELECT
  TO authenticated
  USING (
    park_id IS NULL
    OR is_park_operator(park_id)
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_org_id ON support_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_by ON support_tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_health_events_park_id ON system_health_events(park_id);
CREATE INDEX IF NOT EXISTS idx_health_events_created_at ON system_health_events(created_at);
CREATE INDEX IF NOT EXISTS idx_health_events_severity ON system_health_events(severity);