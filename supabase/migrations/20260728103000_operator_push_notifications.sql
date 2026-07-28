-- Operator push notifications on the shared/staff Supabase project.
--
-- Why here instead of the operator-auth project?
-- - The existing VAPID/webpush pipeline already runs on this shared project.
-- - Support replies, kiosk photo flow and machine status all exist here.
-- - Operator browsers still authenticate with their own project JWTs via
--   dedicated edge functions, but the actual subscriptions + dispatch state
--   live alongside the event sources so we can send background pushes without
--   duplicating that infrastructure.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.operator_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  operator_user_id uuid not null,
  organization_id uuid,
  park_id uuid not null references public.parks(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.operator_push_subscriptions enable row level security;

create table if not exists public.operator_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  operator_user_id uuid not null,
  organization_id uuid,
  park_id uuid not null references public.parks(id) on delete cascade,
  push_enabled boolean not null default false,
  photo_inactivity_enabled boolean not null default true,
  photo_inactivity_minutes integer not null default 30,
  paper_low_enabled boolean not null default true,
  paper_low_threshold integer not null default 20,
  support_enabled boolean not null default true,
  system_health_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operator_user_id, park_id),
  constraint operator_notification_preferences_photo_minutes_check
    check (photo_inactivity_minutes between 5 and 240),
  constraint operator_notification_preferences_paper_threshold_check
    check (paper_low_threshold between 1 and 500)
);

alter table public.operator_notification_preferences enable row level security;

create table if not exists public.operator_notification_dispatch_state (
  operator_user_id uuid not null,
  park_id uuid not null references public.parks(id) on delete cascade,
  notification_type text not null,
  state_key text,
  last_sent_at timestamptz,
  resolved_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  primary key (operator_user_id, park_id, notification_type)
);

alter table public.operator_notification_dispatch_state enable row level security;

create or replace function public.set_operator_notification_preferences_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_operator_notification_preferences_updated_at
  on public.operator_notification_preferences;
create trigger trg_operator_notification_preferences_updated_at
  before update on public.operator_notification_preferences
  for each row
  execute function public.set_operator_notification_preferences_updated_at();

create or replace function public.dispatch_operator_notifications_cron()
returns void
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
    return;
  end if;

  perform net.http_post(
    url := 'https://kvpcwlcfgmsmarjtwpsx.supabase.co/functions/v1/dispatch-operator-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Dispatch-Secret', dispatch_secret
    ),
    body := '{}'::jsonb
  );
end;
$$;

create or replace function public.notify_operator_support_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dispatch_secret text;
begin
  if new.author_role is distinct from 'support' then
    return new;
  end if;

  begin
    select decrypted_secret into dispatch_secret
    from vault.decrypted_secrets
    where name = 'dispatch_push_secret';

    if dispatch_secret is null then
      return new;
    end if;

    perform net.http_post(
      url := 'https://kvpcwlcfgmsmarjtwpsx.supabase.co/functions/v1/dispatch-operator-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Dispatch-Secret', dispatch_secret
      ),
      body := jsonb_build_object(
        'reason', 'support_reply',
        'park_id', new.organization_id,
        'ticket_id', new.ticket_id,
        'message_id', new.id
      )
    );
  exception when others then
    raise warning 'notify_operator_support_reply failed for support ticket message %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_notify_operator_support_reply on public.support_ticket_messages;
create trigger trg_notify_operator_support_reply
  after insert on public.support_ticket_messages
  for each row
  execute function public.notify_operator_support_reply();

do $jobblock$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = 'dispatch-operator-notifications';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'dispatch-operator-notifications',
    '*/10 * * * *',
    $sql$select public.dispatch_operator_notifications_cron();$sql$
  );
end;
$jobblock$;
