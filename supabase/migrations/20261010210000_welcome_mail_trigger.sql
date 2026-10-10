-- F3 (docs/PRODUKT_PLAN.md): Willkommens-Mail für ALLE Parks direkt in der Datenbank.
-- Nach einer Freischaltung (photo_claims.status = 'claimed') mit Werbe-Einwilligung legt der Trigger – wenn die
-- Automation des Parks an ist, der Park Marketing Pro hat und Absender-Einstellungen existieren – eine Zeile in
-- park_email_sends an; versendet wird sie vom Takt park-email-dispatch (Make). Fehler im Trigger werden verschluckt:
-- eine Freischaltung darf nie daran scheitern.
create or replace function public.queue_park_welcome_mail()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  auto record;
  ent record;
  addr text;
  allowed boolean;
begin
  begin
    if new.status is distinct from 'claimed'
       or coalesce(new.marketing_opt_in, false) is not true
       or new.email is null
       or position('@' in new.email) = 0 then
      return new;
    end if;
    -- Beim Update nur, wenn die Einwilligung/Freischaltung neu dazukommt.
    if tg_op = 'UPDATE' and old.status = 'claimed' and coalesce(old.marketing_opt_in, false) = true then
      return new;
    end if;

    select a.campaign_id, a.delay_hours into auto
      from public.park_email_automations a
     where a.park_id = new.park_id and a.type = 'welcome' and a.enabled and a.campaign_id is not null;
    if not found then return new; end if;

    select e.plan, e.status, e.trial_until, coalesce(e.features, '{}') as features into ent
      from public.park_entitlements e where e.park_id = new.park_id;
    if not found then return new; end if;
    allowed := ('email_automations' = any(ent.features))
      or (ent.plan = 'marketing_pro' and (ent.status = 'active'
          or (ent.status = 'trial' and (ent.trial_until is null or ent.trial_until + 1 > current_date))));
    if not allowed then return new; end if;

    addr := lower(trim(new.email));
    if exists (select 1 from public.crm_marketing_opt_outs where email = addr) then return new; end if;
    if not exists (select 1 from public.park_email_settings where park_id = new.park_id) then return new; end if;

    insert into public.park_email_sends (campaign_id, park_id, claim_id, email, send_after)
    values (auto.campaign_id, new.park_id, new.id, addr, now() + make_interval(hours => auto.delay_hours))
    on conflict (campaign_id, email) do nothing;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists photo_claims_welcome_mail on public.photo_claims;
create trigger photo_claims_welcome_mail
  after insert or update of status, marketing_opt_in on public.photo_claims
  for each row execute function public.queue_park_welcome_mail();
