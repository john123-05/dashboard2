-- Notifies staff whenever an operator (customer/park) posts a new message
-- on an existing support ticket - previously only ticket *creation* pushed
-- a notification, so a reply on an already-open ticket went unnoticed
-- unless a staff member happened to have the page open. Mirrors
-- notify_new_support_ticket() in 20260714150000_notify_new_support_ticket.sql.
-- Gated to author_role = 'operator' so support's own replies don't notify
-- support.
create or replace function public.notify_new_support_ticket_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dispatch_secret text;
begin
  begin
    select decrypted_secret into dispatch_secret
    from vault.decrypted_secrets
    where name = 'dispatch_push_secret';

    if dispatch_secret is null then
      return NEW;
    end if;

    perform net.http_post(
      url := 'https://kvpcwlcfgmsmarjtwpsx.supabase.co/functions/v1/dispatch-lead-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Dispatch-Secret', dispatch_secret
      ),
      body := jsonb_build_object(
        'table', 'support_ticket_messages',
        'record', row_to_json(NEW)
      )
    );
  exception when others then
    raise warning 'notify_new_support_ticket_message failed for message %: %', NEW.id, sqlerrm;
  end;

  return NEW;
end;
$$;

drop trigger if exists trg_notify_new_support_ticket_message on public.support_ticket_messages;
create trigger trg_notify_new_support_ticket_message
  after insert on public.support_ticket_messages
  for each row
  when (NEW.author_role = 'operator')
  execute function public.notify_new_support_ticket_message();
