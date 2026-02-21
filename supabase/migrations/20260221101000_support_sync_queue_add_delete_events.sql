/*
  # Support Sync Queue: add DELETE event support

  Enables outbound mirroring of delete operations without relying on
  direct database webhooks to a target HTTP endpoint.
*/

-- Allow DELETE events in queue rows.
ALTER TABLE public.support_sync_queue
  DROP CONSTRAINT IF EXISTS valid_support_sync_event_type;

ALTER TABLE public.support_sync_queue
  ADD CONSTRAINT valid_support_sync_event_type
  CHECK (event_type IN ('insert', 'update', 'delete'));

-- Queue rows must survive support_tickets deletes so delete events can be synced.
ALTER TABLE public.support_sync_queue
  DROP CONSTRAINT IF EXISTS support_sync_queue_ticket_id_fkey;

-- Recreate queue trigger functions with INSERT/UPDATE/DELETE support.
CREATE OR REPLACE FUNCTION public.enqueue_support_ticket_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record jsonb;
  v_entity_id uuid;
  v_ticket_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_record := to_jsonb(OLD);
    v_entity_id := OLD.id;
    v_ticket_id := OLD.id;
  ELSE
    v_record := to_jsonb(NEW);
    v_entity_id := NEW.id;
    v_ticket_id := NEW.id;
  END IF;

  INSERT INTO public.support_sync_queue (
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
    v_entity_id,
    v_ticket_id,
    lower(TG_OP),
    v_record
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_support_ticket_message_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record jsonb;
  v_entity_id uuid;
  v_ticket_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_record := to_jsonb(OLD);
    v_entity_id := OLD.id;
    v_ticket_id := OLD.ticket_id;
  ELSE
    v_record := to_jsonb(NEW);
    v_entity_id := NEW.id;
    v_ticket_id := NEW.ticket_id;
  END IF;

  INSERT INTO public.support_sync_queue (
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
    v_entity_id,
    v_ticket_id,
    lower(TG_OP),
    v_record
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_enqueue_sync ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_enqueue_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_support_ticket_sync();

DROP TRIGGER IF EXISTS trg_support_ticket_messages_enqueue_sync ON public.support_ticket_messages;
CREATE TRIGGER trg_support_ticket_messages_enqueue_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.support_ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_support_ticket_message_sync();

-- If webhook mode was configured earlier, disable it to avoid duplicate outbound paths.
DO $$
BEGIN
  IF to_regclass('public.support_sync_webhook_config') IS NOT NULL THEN
    UPDATE public.support_sync_webhook_config
    SET enabled = false,
        updated_at = now()
    WHERE id = true;
  END IF;

  IF to_regprocedure('public.rebuild_support_sync_webhooks()') IS NOT NULL THEN
    PERFORM public.rebuild_support_sync_webhooks();
  END IF;
END;
$$;
