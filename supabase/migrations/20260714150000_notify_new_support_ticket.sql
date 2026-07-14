-- Notifies staff (via the existing dispatch-lead-push web push pipeline)
-- whenever a new support ticket lands in this table. Unlike the kiosk photo
-- rollup trigger, this applies to every park — support tickets aren't tied
-- to any particular sales model.
create or replace function public.notify_new_support_ticket()
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
        'table', 'support_tickets',
        'record', row_to_json(NEW)
      )
    );
  exception when others then
    raise warning 'notify_new_support_ticket failed for ticket %: %', NEW.id, sqlerrm;
  end;

  return NEW;
end;
$$;

drop trigger if exists trg_notify_new_support_ticket on public.support_tickets;
create trigger trg_notify_new_support_ticket
  after insert on public.support_tickets
  for each row execute function public.notify_new_support_ticket();
