-- Single source of truth for the staff Kosten page and its payment-reminder
-- cron - previously this data only existed as a hardcoded array in
-- CostsPage.tsx, which a scheduled reminder job can't read. Moving it here
-- means the page and the notification always agree on amounts/dates.
create table if not exists public.cost_items (
  id uuid primary key default gen_random_uuid(),
  vendor text not null,
  vendor_purpose text not null,
  payer text, -- null = not yet clarified who pays
  item_name text not null,
  item_group text, -- optional sub-heading within a vendor (e.g. Domain Factory's "Domains" vs "E-Mail-Postfächer")
  amount numeric(10,2) not null,
  currency text not null check (currency in ('EUR', 'USD')),
  cycle text not null check (cycle in ('monthly', 'yearly')),
  next_due_date date, -- null = no known billing date yet (e.g. Canva) - the reminder cron just skips these
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cost_items enable row level security;

drop policy if exists "Admins can read cost items" on public.cost_items;
create policy "Admins can read cost items"
  on public.cost_items
  for select
  to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()));
-- No insert/update/delete policy for anon/authenticated: only the
-- security-definer cron function and service-role edge functions write here.

-- Populated from the Wix/IONOS/Make.com/Bolt.new invoices, the Domain
-- Factory invoices (32 of them, Jan 2025-Apr 2026), and the domain-registrar
-- screenshots, as compiled on 2026-07-14. next_due_date is each item's next
-- real charge date - the reminder cron advances it by one cycle once it's
-- passed, but the amount itself needs a manual check against the actual
-- invoice occasionally, since renewal prices can shift.
insert into public.cost_items (vendor, vendor_purpose, payer, item_name, item_group, amount, currency, cycle, next_due_date, note, sort_order) values
  ('Wix', 'Website-Hosting, Domain lift.pictures, E-Mail-Marketing', 'Tom', 'Premiumpaket Light (Hosting)', null, 168.00, 'EUR', 'yearly', '2026-08-01', 'Laufzeit 1.8.2026 – 1.8.2027', 10),
  ('Wix', 'Website-Hosting, Domain lift.pictures, E-Mail-Marketing', 'Tom', 'Domain lift.pictures', null, 14.95, 'EUR', 'yearly', '2026-08-01', 'Laufzeit 1.8.2026 – 1.8.2027', 11),
  ('Wix', 'Website-Hosting, Domain lift.pictures, E-Mail-Marketing', 'Tom', 'E-Mail-Marketing Essentials', null, 12.00, 'EUR', 'monthly', '2026-07-30', null, 12),

  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'photoqm.com', 'Domains', 23.88, 'EUR', 'yearly', '2027-01-07', 'Verlängert bis 07.01.2027', 20),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'fotoanlagen.com', 'Domains', 23.88, 'EUR', 'yearly', '2027-01-17', 'Verlängert bis 17.01.2027', 21),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'noltingtom.de', 'Domains', 11.88, 'EUR', 'yearly', '2027-02-01', 'Verlängert bis 01.02.2027 (1. Jahr war Aktionspreis 0,99 €) — Zweck unklar, evtl. privat', 22),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'funfotobox.de', 'Domains', 11.88, 'EUR', 'yearly', '2027-02-08', 'Verlängert bis 08.02.2027', 23),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'tomsvilla.de', 'Domains', 11.88, 'EUR', 'yearly', '2027-02-13', 'Verlängert bis 13.02.2027 — Zweck unklar, evtl. privat', 24),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'liftpic.com', 'Domains', 23.88, 'EUR', 'yearly', '2027-04-25', 'Verlängert bis 25.04.2027', 25),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'erlebnisfoto.com', 'Domains', 23.88, 'EUR', 'yearly', '2026-06-16', '⚠ Letzte bekannte Laufzeit endete 16.06.2026 — keine neuere Verlängerungsrechnung vorliegend', 26),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'fotosystems.eu', 'Domains', 21.48, 'EUR', 'yearly', '2026-08-19', 'Laufzeit bis 19.08.2026', 27),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'rideshooter.com', 'Domains', 23.88, 'EUR', 'yearly', '2026-09-13', 'Laufzeit bis 13.09.2026', 28),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'fotoanlage.com', 'Domains', 23.88, 'EUR', 'yearly', '2026-09-13', 'Laufzeit bis 13.09.2026 (eigene Domain, nicht fotoanlagen.com)', 29),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'sharesmile.de', 'Domains', 11.88, 'EUR', 'yearly', '2026-10-06', 'Laufzeit bis 06.10.2026 — Zweck unklar', 30),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'abi83.de', 'Domains', 11.88, 'EUR', 'yearly', '2026-12-12', 'Laufzeit bis 12.12.2026 — Zweck unklar, evtl. privat', 31),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'liftpic.at', 'Domains', 23.88, 'EUR', 'yearly', '2026-12-27', 'Laufzeit bis 27.12.2026', 32),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'liftpic.de', 'Domains', 11.88, 'EUR', 'yearly', '2026-12-27', 'Laufzeit bis 27.12.2026', 33),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'alfom.de', 'Domains', 11.88, 'EUR', 'yearly', '2026-12-27', 'Laufzeit bis 27.12.2026 — Zweck unklar', 34),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'liftpictures.com', 'Domains', 23.88, 'EUR', 'yearly', '2026-12-27', 'Laufzeit bis 27.12.2026', 35),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'onridephoto.com', 'Domains', 23.88, 'EUR', 'yearly', '2026-12-30', 'Aktuelles Jahr zum Aktionspreis 0,99 €, danach 23,88 €/Jahr', 36),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'onridevideo.com', 'Domains', 23.88, 'EUR', 'yearly', '2026-12-31', 'Laufzeit bis 31.12.2026', 37),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'yvonnenolting.de', 'Domains', 11.88, 'EUR', 'yearly', '2027-01-08', 'Laufzeit bis 08.01.2027 — Zweck unklar, evtl. privat', 38),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'tnolting@liftpictures.com', 'E-Mail-Postfächer', 23.88, 'EUR', 'yearly', '2026-12-06', 'Microsoft 365 E-Mail Essentials', 39),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'automat@fotoanlagen.com', 'E-Mail-Postfächer', 11.88, 'EUR', 'yearly', '2026-12-06', 'Microsoft 365 E-Mail Essentials', 40),
  ('Domain Factory', 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)', 'Tom', 'info@liftpic.de', 'E-Mail-Postfächer', 11.88, 'EUR', 'yearly', '2026-12-06', 'Microsoft 365 E-Mail Essentials', 41),

  ('IONOS', 'E-Mail-Postfächer kontakt@, newsletter@ und tom@liftpictures-fotosysteme.de', 'John', 'IONOS Mail Basic 1', null, 1.50, 'EUR', 'monthly', '2026-08-03', null, 50),
  ('IONOS', 'E-Mail-Postfächer kontakt@, newsletter@ und tom@liftpictures-fotosysteme.de', 'John', 'E-Mail-Archivierung (5 GB)', null, 2.50, 'EUR', 'monthly', '2026-08-04', null, 51),

  ('Bolt.new', 'Website-Hosting (onridepictures u. a.)', 'John', 'Pro-Plan', null, 25.00, 'USD', 'monthly', '2026-07-26', null, 60),

  ('Make.com', 'Automatisierungen (PDF-E-Mails etc.)', 'John', 'Core Plan (20.000 Operationen/Monat)', null, 18.82, 'USD', 'monthly', '2026-07-19', null, 70),

  ('Canva', 'Design-Tool für Kataloge, PDFs etc.', 'John', 'Monatliches Abo', null, 12.00, 'EUR', 'monthly', null, 'Genaues Abrechnungsdatum noch nicht bekannt', 80),

  ('Domains (weitere)', 'Zusätzlich registrierte Domains', 'John', 'liftpictures-fotos.de', null, 13.00, 'EUR', 'yearly', '2027-06-22', 'Verlängerung: 22.06.2027', 90),
  ('Domains (weitere)', 'Zusätzlich registrierte Domains', 'John', 'dashboard-liftpictures.com', null, 18.00, 'EUR', 'yearly', '2027-01-27', 'Verlängerung: 27.01.2027', 91),
  ('Domains (weitere)', 'Zusätzlich registrierte Domains', 'John', 'liftpictures-app.de', null, 13.00, 'EUR', 'yearly', '2027-01-08', 'Verlängerung: 08.01.2027', 92),
  ('Domains (weitere)', 'Zusätzlich registrierte Domains', 'John', 'attraktionsfotos.de', null, 13.00, 'EUR', 'yearly', '2026-11-15', 'Verlängerung: 15.11.2026', 93),
  ('Domains (weitere)', 'Zusätzlich registrierte Domains', 'John', 'onridefotos.de', null, 13.00, 'EUR', 'yearly', '2026-11-15', 'Verlängerung: 15.11.2026', 94),
  ('Domains (weitere)', 'Zusätzlich registrierte Domains', 'John', 'onridebilder.de', null, 13.00, 'EUR', 'yearly', '2027-02-19', 'Verlängerung: 19.02.2027', 95),
  ('Domains (weitere)', 'Zusätzlich registrierte Domains', 'John', 'onridepictures.com', null, 19.99, 'USD', 'yearly', '2026-09-25', 'Bei Bolt.new registriert — aktuell kostenloser Testzeitraum, erste Abbuchung ab 25.09.2026', 96),
  ('Domains (weitere)', 'Zusätzlich registrierte Domains', 'John', 'liftpictures-contact.com', null, 19.99, 'USD', 'yearly', '2026-08-24', 'Bei Bolt.new registriert — aktuell kostenloser Testzeitraum, erste Abbuchung ab 24.08.2026', 97);

-- Sends one push notification the day before any payment(s) come due
-- ("morgen"), then advances any item whose date has fully passed to its
-- next cycle so the same row keeps generating future reminders without
-- manual upkeep (the amount itself still needs an occasional manual
-- true-up against the real invoice, since renewal prices can shift).
create or replace function public.check_upcoming_cost_payments()
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
    select coalesce(jsonb_agg(jsonb_build_object(
        'item_name', item_name, 'amount', amount, 'currency', currency, 'payer', payer
      )), '[]'::jsonb)
    into due_items
    from public.cost_items
    where next_due_date = current_date + 1;

    if jsonb_array_length(due_items) > 0 then
      begin
        perform net.http_post(
          url := 'https://kvpcwlcfgmsmarjtwpsx.supabase.co/functions/v1/dispatch-lead-push',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Dispatch-Secret', dispatch_secret
          ),
          body := jsonb_build_object(
            'table', 'cost_reminder',
            'record', jsonb_build_object('items', due_items)
          )
        );
      exception when others then
        raise warning 'check_upcoming_cost_payments push failed: %', sqlerrm;
      end;
    end if;
  end if;

  update public.cost_items
  set next_due_date = case cycle
      when 'monthly' then (next_due_date + interval '1 month')::date
      when 'yearly' then (next_due_date + interval '1 year')::date
      else next_due_date
    end,
    updated_at = now()
  where next_due_date < current_date;
end;
$$;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 11:00 UTC = noon in Central European Time (exact in winter/CET, ~1h after
-- solar noon in summer/CEST) - matches the "mittags" ask closely enough
-- without needing a DST-aware schedule, same tradeoff already made for
-- archive-expired-photos-daily.
select cron.schedule(
  'check-upcoming-cost-payments',
  '0 11 * * *',
  $$select public.check_upcoming_cost_payments();$$
);
