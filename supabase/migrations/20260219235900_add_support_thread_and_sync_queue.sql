/*
  # Support Ticket Threading + Cross-Project Sync Queue

  1. New Tables
    - `support_ticket_messages`
      - Message thread entries per ticket
    - `support_sync_queue`
      - Outbound sync queue for cross-project replication

  2. Security
    - RLS enabled on `support_ticket_messages` and `support_sync_queue`
    - Operators can read/write messages only for orgs they belong to
    - Queue table is service-only (no policies for authenticated users)
*/

-- Support ticket message thread
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES operator_profiles(id),
  author_role text NOT NULL DEFAULT 'operator',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_ticket_message_author_role CHECK (author_role IN ('operator', 'support')),
  CONSTRAINT support_ticket_message_not_blank CHECK (length(btrim(message)) > 0)
);

-- Outbound sync queue for mirroring to a second Supabase project
CREATE TABLE IF NOT EXISTS support_sync_queue (
  id bigserial PRIMARY KEY,
  source_table text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_support_sync_source_table CHECK (source_table IN ('support_tickets', 'support_ticket_messages')),
  CONSTRAINT valid_support_sync_entity_type CHECK (entity_type IN ('ticket', 'message')),
  CONSTRAINT valid_support_sync_event_type CHECK (event_type IN ('insert', 'update')),
  CONSTRAINT valid_support_sync_status CHECK (status IN ('pending', 'failed', 'synced'))
);

-- Shared updated_at trigger function for support tables
CREATE OR REPLACE FUNCTION set_support_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Keep message.organization_id aligned with the parent ticket
CREATE OR REPLACE FUNCTION set_support_message_org_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ticket_org_id uuid;
BEGIN
  SELECT organization_id
  INTO ticket_org_id
  FROM support_tickets
  WHERE id = NEW.ticket_id;

  IF ticket_org_id IS NULL THEN
    RAISE EXCEPTION 'support_tickets row not found for ticket_id %', NEW.ticket_id;
  END IF;

  NEW.organization_id = ticket_org_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_ticket_messages_set_org_id ON support_ticket_messages;
CREATE TRIGGER trg_support_ticket_messages_set_org_id
  BEFORE INSERT OR UPDATE OF ticket_id ON support_ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION set_support_message_org_id();

DROP TRIGGER IF EXISTS trg_support_tickets_set_updated_at ON support_tickets;
CREATE TRIGGER trg_support_tickets_set_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION set_support_updated_at();

DROP TRIGGER IF EXISTS trg_support_ticket_messages_set_updated_at ON support_ticket_messages;
CREATE TRIGGER trg_support_ticket_messages_set_updated_at
  BEFORE UPDATE ON support_ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION set_support_updated_at();

DROP TRIGGER IF EXISTS trg_support_sync_queue_set_updated_at ON support_sync_queue;
CREATE TRIGGER trg_support_sync_queue_set_updated_at
  BEFORE UPDATE ON support_sync_queue
  FOR EACH ROW
  EXECUTE FUNCTION set_support_updated_at();

-- Enqueue support_tickets changes for outbound sync
CREATE OR REPLACE FUNCTION enqueue_support_ticket_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO support_sync_queue (
    source_table,
    entity_type,
    entity_id,
    ticket_id,
    event_type,
    payload
  )
  VALUES (
    'support_tickets',
    'ticket',
    NEW.id,
    NEW.id,
    lower(TG_OP),
    to_jsonb(NEW)
  );

  RETURN NEW;
END;
$$;

-- Enqueue support_ticket_messages changes for outbound sync
CREATE OR REPLACE FUNCTION enqueue_support_ticket_message_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO support_sync_queue (
    source_table,
    entity_type,
    entity_id,
    ticket_id,
    event_type,
    payload
  )
  VALUES (
    'support_ticket_messages',
    'message',
    NEW.id,
    NEW.ticket_id,
    lower(TG_OP),
    to_jsonb(NEW)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_enqueue_sync ON support_tickets;
CREATE TRIGGER trg_support_tickets_enqueue_sync
  AFTER INSERT OR UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_support_ticket_sync();

DROP TRIGGER IF EXISTS trg_support_ticket_messages_enqueue_sync ON support_ticket_messages;
CREATE TRIGGER trg_support_ticket_messages_enqueue_sync
  AFTER INSERT OR UPDATE ON support_ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_support_ticket_message_sync();

-- Enable RLS
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_sync_queue ENABLE ROW LEVEL SECURITY;

-- RLS: Support ticket messages
CREATE POLICY "Operators can view messages for their org tickets"
  ON support_ticket_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM support_tickets st
      WHERE st.id = support_ticket_messages.ticket_id
        AND is_org_member(st.organization_id)
    )
  );

CREATE POLICY "Operators can create messages for their org tickets"
  ON support_ticket_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM support_tickets st
      WHERE st.id = support_ticket_messages.ticket_id
        AND is_org_member(st.organization_id)
    )
  );

CREATE POLICY "Operators can update own messages for their org tickets"
  ON support_ticket_messages FOR UPDATE
  TO authenticated
  USING (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM support_tickets st
      WHERE st.id = support_ticket_messages.ticket_id
        AND is_org_member(st.organization_id)
    )
  )
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM support_tickets st
      WHERE st.id = support_ticket_messages.ticket_id
        AND is_org_member(st.organization_id)
    )
  );

-- Queue table intentionally has no authenticated policies.
-- It is intended to be processed via service-role only.

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_id
  ON support_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_org_id
  ON support_ticket_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_created_at
  ON support_ticket_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_support_sync_queue_status_next_attempt
  ON support_sync_queue(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_support_sync_queue_ticket_id
  ON support_sync_queue(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_sync_queue_source_table
  ON support_sync_queue(source_table);
