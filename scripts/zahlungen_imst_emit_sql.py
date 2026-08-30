#!/usr/bin/env python3
import csv, os, datetime

CSV = os.path.join(os.path.dirname(__file__), "imst_ledger.csv")
OUT = "/Users/johnnolting/Downloads/Cursor/dashboard2-4/supabase/migrations/20260831005000_machine_sale_payments_imst_backfill.sql"

PARK_ID = "85c77b81-9f9b-4b4e-9f70-9c6ffa0b9b14"
MACHINE = "pcneu"

def q(v):
    if v is None or v == "":
        return "null"
    return "'" + str(v).replace("'", "''") + "'"

def qi(v):
    if v is None or v == "":
        return "null"
    return str(int(v))

rows = list(csv.DictReader(open(CSV)))

header = f"""/*
  # Imst-Backfill für machine_sale_payments  ({len(rows)} Zeilen)

  Erzeugt aus:
    Statistic.txt            (Verkaufs-Spine, Zahlart-Flag 2=Karte / 1=Bar)
    ZVT-2026-06/07/08-0001-HDL.LOG   (hobex Händlerbelege)
  über scripts/zahlungen_imst.py (dieselbe Logik, reproduzierbar).

  Zeitraum 15.08.2025 - 30.08.2026. Vor 2026-03 hatte der Automat noch kein
  Zahlart-Flag und es gibt keine Terminal-Logs -> method = 'unbekannt'
  (method_source = 'kein_flag'). Ab 2026-06 ~93 % Karte / ~7 % Bar.

  sold_local ist die Wanduhrzeit wie im Log; sold_at wird daraus als
  Europe/Vienna abgeleitet. Idempotent über machine_sale_payments_dedup_idx.
*/

insert into public.machine_sale_payments
  (park_id, machine_id, sold_at, sold_local, bild_nr, print_count,
   method, method_source, amount_cents, card_scheme, receipt_no, auth_code,
   pan_masked, match_delta_s, source_file)
values
"""

def row_sql(r):
    local = r["sold_at"]  # "YYYY-MM-DD HH:MM:SS"
    return ("  (" +
            f"'{PARK_ID}', '{MACHINE}', " +
            f"(timestamp '{local}' at time zone 'Europe/Vienna'), " +
            f"timestamp '{local}', " +
            f"{q(r['bild_nr'])}, {qi(r['prints'])}, " +
            f"{q(r['method'])}, {q(r['method_source'])}, {qi(r['amount_cents'])}, " +
            f"{q(r['card_scheme'])}, {q(r['receipt_no'])}, {q(r['auth_code'])}, " +
            f"{q(r['pan_masked'])}, {qi(r['match_delta_s'])}, {q(r.get('source_file'))}" +
            ")")

BATCH = 500
parts = [header.rstrip() + "\n"]
# we will emit as separate INSERT statements per batch for editor friendliness
out_stmts = []
for i in range(0, len(rows), BATCH):
    chunk = rows[i:i+BATCH]
    body = ",\n".join(row_sql(r) for r in chunk)
    stmt = ("insert into public.machine_sale_payments\n"
            "  (park_id, machine_id, sold_at, sold_local, bild_nr, print_count,\n"
            "   method, method_source, amount_cents, card_scheme, receipt_no, auth_code,\n"
            "   pan_masked, match_delta_s, source_file)\nvalues\n"
            + body +
            "\non conflict (machine_id, receipt_no) where receipt_no is not null do nothing;\n")
    out_stmts.append(stmt)

with open(OUT, "w") as fh:
    fh.write("/*\n"
             f"  # Imst-Backfill für machine_sale_payments  ({len(rows)} Zeilen)\n\n"
             "  Erzeugt aus Statistic.txt (Zahlart-Flag 2=Karte / 1=Bar) und den hobex\n"
             "  Händlerbelegen ZVT-2026-06/07/08-0001-HDL.LOG über scripts/zahlungen_imst.py.\n"
             "  Zeitraum 15.08.2025-30.08.2026. Vor 2026-03 kein Flag / keine Terminal-Logs\n"
             "  -> method='unbekannt'. Idempotent (on conflict do nothing).\n"
             "*/\n\n")
    fh.write("\n".join(out_stmts))

print("wrote", OUT)
print("rows:", len(rows), "statements:", len(out_stmts))
print("bytes:", os.path.getsize(OUT))
