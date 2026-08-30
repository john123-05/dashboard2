/*
  # machine_sale_payments - Zahlungsart je Einzelkauf (rückwirkend befüllbar)

  Bisher wurde die Karte/Bar-Aufteilung nur vom Automaten selbst im Heartbeat
  mitgeschickt (last_status.payments) und nirgends gespeichert. Für Imst gibt es
  aber echte Protokolle, aus denen sich jeder Kauf rückwirkend einer Zahlungsart
  zuordnen lässt:

    - C:\liftpic\samuel_neu\Statistic.txt   -> Verkaufs-Spine des Automaten.
      Jede Zeile ein Foto-Verkauf, mit Zeit, Bildnummer und einem Zahlart-Flag:
      2 = Karte, 1 = Bar (Münzprüfer), 0/leer = unklar.
    - C:\Users\Pc\Documents\GUB\ZVTLOG\ZVT-YYYY-MM-0001-HDL.LOG  -> hobex
      Händlerbelege, ein Block je genehmigter Kartenzahlung: Betrag, Kartenmarke,
      Beleg-Nr, Autorisierungscode.

  Ein Skript (scripts/zahlungen_imst.py im dashboard2-Repo) paart beide Quellen
  pro Kalendertag der Reihe nach (die PC-Uhr und die Terminal-Uhr laufen
  ~1-3 min auseinander, aber die Tagessummen stimmen) und schreibt das Ergebnis
  hier hinein. Die eigentlichen Datenzeilen kommen in der Folge-Migration
  20260831005000_machine_sale_payments_imst_backfill.sql.

  Absichtlich generisch (park_id + machine_id), damit weitere Automaten später
  dieselbe Tabelle nutzen können. Der Automaten-Agent soll das künftig live
  mitschreiben statt es nur im Heartbeat zu melden.
*/

create table if not exists public.machine_sale_payments (
  id             bigint generated always as identity primary key,
  park_id        uuid not null references public.parks(id) on delete cascade,
  machine_id     text not null,

  -- sold_at: echter Zeitpunkt als timestamptz (sold_local als Europe/Vienna gedeutet)
  sold_at        timestamptz not null,
  -- sold_local: Wanduhrzeit exakt wie im Log gedruckt, ohne Zeitzonen-Rechnerei
  sold_local     timestamp   not null,

  bild_nr        text,        -- Bildnummer aus der Verkaufsliste (Schlüssel zum Foto)
  print_count    smallint,

  method         text not null
                   check (method in ('karte','bar','unbekannt')),
  -- woher die Zuordnung stammt, für Nachvollziehbarkeit:
  --   automat_flag              - Zahlart-Flag aus Statistic.txt (2/1)
  --   automat_flag_ohne_beleg   - Flag sagt Karte, kein passender Händlerbeleg gefunden
  --   beleg_ohne_verkaufszeile  - Kartenbeleg vorhanden, aber keine Verkaufszeile
  --                               (Kunde zahlte, Druck ging nicht raus o.ä.)
  --   kein_flag                 - Altzeile vor 2026-03 ohne Flag -> unbekannt
  method_source  text not null
                   check (method_source in
                     ('automat_flag','automat_flag_ohne_beleg',
                      'beleg_ohne_verkaufszeile','kein_flag')),

  amount_cents   integer,
  card_scheme    text,        -- VISA | MASTERCARD | MAESTRO | V PAY | MC-E
  receipt_no     text,        -- hobex Beleg#  (z.B. H178001)
  auth_code      text,
  pan_masked     text,

  match_delta_s  integer,     -- Sekunden zwischen Verkaufszeile und Beleg (Diagnose)
  source_file    text,
  ingested_at    timestamptz not null default now()
);

create index if not exists machine_sale_payments_park_time_idx
  on public.machine_sale_payments (park_id, sold_at);
create index if not exists machine_sale_payments_park_method_time_idx
  on public.machine_sale_payments (park_id, method, sold_at);

-- Ein hobex-Beleg gehört zu genau einem Kauf. Das ist der einzige echt
-- eindeutige Schlüssel; damit kann der Live-Agent später sauber upserten und
-- ein doppelt laufender Backfill dupliziert die Kartenkäufe nicht.
create unique index if not exists machine_sale_payments_receipt_idx
  on public.machine_sale_payments (machine_id, receipt_no)
  where receipt_no is not null;

alter table public.machine_sale_payments enable row level security;

-- Staff-Dashboard liest direkt (admin_users), wie bei park_photo_sales_daily.
-- Operator-Dashboard liest später über eine Edge-Function mit Service-Role.
drop policy if exists "Admins can read machine sale payments" on public.machine_sale_payments;
create policy "Admins can read machine sale payments"
  on public.machine_sale_payments
  for select
  to authenticated
  using (exists (select 1 from public.admin_users where admin_users.user_id = auth.uid()));
