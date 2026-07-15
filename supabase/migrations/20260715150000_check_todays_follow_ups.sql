-- Sends one push notification each morning for every lead_follow_ups row
-- due that day ("Zeit für Follow-up: Person X"). Deliberately read-only
-- against lead_follow_ups - unlike check_upcoming_cost_payments, this never
-- advances or clears anything itself, since follow-ups are always
-- marked done manually (or via their own cadence, from the UI) rather than
-- by the reminder cron.
create or replace function public.check_todays_follow_ups()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  dispatch_secret text;
  due_items jsonb;
begin
  select decrypted_secret into dispatch_secret
  from vault.decrypted_secrets
  where name = 'dispatch_push_secret';

  if dispatch_secret is not null then
    select coalesce(jsonb_agg(jsonb_build_object('email', email, 'note', note)), '[]'::jsonb)
    into due_items
    from public.lead_follow_ups
    where next_due_at = current_date;

    if jsonb_array_length(due_items) > 0 then
      begin
        perform net.http_post(
          url := 'https://kvpcwlcfgmsmarjtwpsx.supabase.co/functions/v1/dispatch-lead-push',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Dispatch-Secret', dispatch_secret
          ),
          body := jsonb_build_object(
            'table', 'lead_follow_up_due',
            'record', jsonb_build_object('items', due_items)
          )
        );
      exception when others then
        raise warning 'check_todays_follow_ups push failed: %', sqlerrm;
      end;
    end if;
  end if;
end;
$$;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 07:00 UTC = 08:00 CET / 09:00 CEST - comfortably "vormittags" either side
-- of the DST switch, same tradeoff already made for
-- check-upcoming-cost-payments (11:00 UTC for "mittags").
select cron.schedule(
  'check-todays-follow-ups',
  '0 7 * * *',
  $$select public.check_todays_follow_ups();$$
);
