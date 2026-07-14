-- Lets operators archive a support ticket (hide it from the active list
-- without deleting it) from the operator dashboard's redesigned Support
-- page. Deleting a ticket needs no schema change: support_ticket_messages
-- already cascades on support_tickets delete (see
-- 20260220004915_create_support_ticket_tables.sql in liftpictures-app-v2).
alter table public.support_tickets
  add column if not exists archived_at timestamptz null;

create index if not exists idx_support_tickets_archived_at
  on public.support_tickets (archived_at);
