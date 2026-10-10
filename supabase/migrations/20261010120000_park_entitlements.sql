-- B2 · SHARED: kvpcwlcfgmsmarjtwpsx. John führt diese Migration im SQL-Editor aus.
-- Keine Bestandsparks umstellen: Ohne Zeile gilt weiter die Starter-Übergangsregel.
begin;

create table public.park_entitlements (
  park_id uuid primary key references public.parks(id) on delete cascade,
  plan text not null check (plan in ('basis', 'marketing_starter', 'marketing_pro')),
  features text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'trial', 'paused', 'cancelled')),
  trial_until date,
  source text not null default 'manual' check (source in ('manual', 'stripe')),
  stripe_subscription_id text,
  updated_at timestamptz not null default now(),
  constraint park_entitlements_known_features check (
    array_position(features, null) is null and features <@ array[
      'crm_contacts', 'crm_survey', 'crm_social', 'crm_pixel', 'email_marketing',
      'social_campaigns', 'review_routing', 'team_permissions', 'reports_pro',
      'online_shop', 'speed'
    ]::text[]
  ),
  constraint park_entitlements_trial_end check (status <> 'trial' or trial_until is not null)
);

alter table public.park_entitlements enable row level security;
-- Absichtlich keine Client-Policies: Operator und Staff gehen über geprüfte Functions.
revoke all on table public.park_entitlements from public, anon, authenticated;
grant select, insert, update, delete on table public.park_entitlements to service_role;

create function public.set_park_entitlements_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.set_park_entitlements_updated_at() from public, anon, authenticated;

create trigger park_entitlements_updated_at
before update on public.park_entitlements
for each row execute function public.set_park_entitlements_updated_at();

comment on table public.park_entitlements is
  'Plan und zusätzliche Freischaltungen pro Park. Nur über operator-entitlements / admin-park-entitlements zugänglich.';
comment on column public.park_entitlements.trial_until is
  'Letzter eingeschlossener Testtag (Europe/Berlin). Pausiert, gekündigt oder Test abgelaufen: Basis ohne zusätzliche Features.';

commit;
