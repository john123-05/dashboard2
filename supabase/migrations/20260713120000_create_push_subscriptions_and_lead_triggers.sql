-- Web Push: per-device subscriptions, saved by save-push-subscription
-- (called from the staff Einstellungen page) and read by dispatch-lead-push.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
-- Deliberately no policies for anon/authenticated: every access path goes
-- through save-push-subscription / dispatch-lead-push, both of which use the
-- service role key.

-- Fires dispatch-lead-push (a Supabase Edge Function) whenever a new row
-- lands in any of the 4 lead tables, so staff get an OS-level push
-- notification without needing the page open. pg_net's http_post is
-- fire-and-forget (async, via a background worker), so this adds no latency
-- to the insert itself.
--
-- The shared X-Dispatch-Secret is intentionally NOT in this file — it's read
-- from Supabase Vault (see the one-off `select vault.create_secret(...)`
-- run directly in the SQL editor, never committed) so it never ends up in
-- git history. Matches how the same secret is stored as a Function secret
-- (DISPATCH_PUSH_SECRET) on the dispatch-lead-push side, also outside git.
create extension if not exists pg_net;

create or replace function public.notify_new_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dispatch_secret text;
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
      'table', TG_TABLE_NAME,
      'record', row_to_json(NEW)
    )
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_push on public.email_leads;
create trigger trg_notify_push
  after insert on public.email_leads
  for each row execute function public.notify_new_lead();

drop trigger if exists trg_notify_push on public.website_requests;
create trigger trg_notify_push
  after insert on public.website_requests
  for each row execute function public.notify_new_lead();

drop trigger if exists trg_notify_push on public.german_website_requests;
create trigger trg_notify_push
  after insert on public.german_website_requests
  for each row execute function public.notify_new_lead();

drop trigger if exists trg_notify_push on public.product_finder_submissions;
create trigger trg_notify_push
  after insert on public.product_finder_submissions
  for each row execute function public.notify_new_lead();
