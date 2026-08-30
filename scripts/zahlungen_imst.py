#!/usr/bin/env python3
"""
Imst Zahlungs-Zuordnung (rueckwirkend).

Quellen:
  Statistic.txt            - Verkaufs-Spine des Automaten. Jede Zeile = ein Foto-Verkauf.
                             Format neu:  DD.MM.YYYY HH:MM:SS::<pfad>::<prints>||<zahlart>||<betrag>
                             zahlart: 2 = Karte, 1 = Bar (Muenzen), 0 = unklar
                             betrag ist im Automatenlog immer 0,00 -> unbrauchbar.
  ZVT-*-HDL.LOG            - hobex Haendlerbelege, ein Block je genehmigter Kartenzahlung.
                             Liefert Betrag, Kartenmarke, Beleg-Nr, Autorisierungscode,
                             und die echte Transaktionszeit (Zeile im Block, nicht der
                             Log-Zeitstempel - der hat Batch-Versatz, F-039).

Ergebnis: eine Zeile je Verkauf mit Zahlungsart + (bei Karte) Beleg-Details.
"""
import re, os, csv, json, glob, collections, datetime

D = os.path.expanduser("~/Downloads/imst-zahlungen")
OUT = os.path.dirname(os.path.abspath(__file__))

PARK_PRICE_CENTS = 500  # Imst Fixpreis; Statistic-Betrag ist immer 0,00

# ---------------------------------------------------------------- Statistic.txt
def load_statistic():
    rows = []
    with open(os.path.join(D, "Statistic.txt"), encoding="utf-8", errors="replace") as fh:
        for raw in fh:
            raw = raw.rstrip("\r\n")
            if not raw.strip():
                continue
            parts = raw.split("::")
            if len(parts) < 2:
                continue
            try:
                dt = datetime.datetime.strptime(parts[0].strip(), "%d.%m.%Y %H:%M:%S")
            except ValueError:
                continue
            path = parts[1].strip()
            rest = parts[2].strip() if len(parts) > 2 else ""
            seg = rest.split("||")
            prints = seg[0].strip() if seg and seg[0].strip() else None
            zahlart = seg[1].strip() if len(seg) > 1 else None
            m = re.search(r"(\d+)", os.path.basename(path))
            bild = m.group(1).lstrip("0") or "0" if m else None
            rows.append(dict(dt=dt, path=path, bild=bild, prints=prints, zahlart_code=zahlart))
    rows.sort(key=lambda r: r["dt"])
    return rows

# ---------------------------------------------------------------- HDL parser
BLOCK_RE = re.compile(r"^\d{2}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}\.\d+")
DATE_RE  = re.compile(r"^(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2}:\d{2})\s*$")
SUM_RE   = re.compile(r"EUR:\s*([\d.,]+)")
KARTE_RE = re.compile(r"^Karte:\s*(.+?)\s*$")
BELEG_RE = re.compile(r"^Beleg#\s*:\s*(\S+)")
AUTH_RE  = re.compile(r"Autorisierungscode:\s*(\S+)")
PAN_RE   = re.compile(r"^L:\s*([*\d]+)\s*$")

def eur_to_cents(s):
    if not s:
        return None
    s = s.strip().replace(".", "").replace(",", ".")
    try:
        return round(float(s) * 100)
    except ValueError:
        return None

def parse_hdl(path):
    with open(path, encoding="utf-8", errors="replace") as fh:
        lines = fh.read().split("\n")
    blocks, cur = [], None
    for ln in lines:
        ln = ln.rstrip("\r")
        if BLOCK_RE.match(ln):
            if cur is not None:
                blocks.append(cur)
            cur = [ln.strip()]
        elif cur is not None:
            cur.append(ln)
    if cur is not None:
        blocks.append(cur)

    sales, skipped = [], collections.Counter()
    for b in blocks:
        body = b[1:]
        text = "\n".join(body)
        if "HÄNDLERBELEG" not in text:
            skipped["kein_haendlerbeleg"] += 1
            continue
        if not any(l.strip() == "KAUF" for l in body):
            skipped["kein_kauf"] += 1
            continue
        approved = "Genehmigt" in text
        declined = ("Abgelehnt" in text) or ("ZAHLUNG FEHLGESCHLAGEN" in text)
        if not approved or declined:
            skipped["abgelehnt_oder_unbestaetigt"] += 1
            continue
        dt = None
        for l in body:
            mm = DATE_RE.match(l.strip())
            if mm:
                dt = datetime.datetime.strptime(mm.group(1) + " " + mm.group(2), "%d.%m.%Y %H:%M:%S")
                break
        amt = scheme = beleg = auth = pan = None
        for l in body:
            s = l.strip()
            m2 = SUM_RE.search(s)
            if m2 and amt is None and "SUMME" not in s:
                # nimm nur den Betrag nach SUMME-Block; erste EUR:-Zeile
                amt = m2.group(1)
            mk = KARTE_RE.match(s)
            if mk: scheme = mk.group(1).upper()
            mb = BELEG_RE.match(s)
            if mb: beleg = mb.group(1)
            ma = AUTH_RE.search(s)
            if ma: auth = ma.group(1)
            mp = PAN_RE.match(s)
            if mp: pan = mp.group(1)
        sales.append(dict(dt=dt, amt_cents=eur_to_cents(amt), scheme=scheme,
                          beleg=beleg, auth=auth, pan=pan, raw_ts=b[0], src=os.path.basename(path)))
    return sales, skipped

def load_hdl():
    alls = []
    for f in sorted(glob.glob(os.path.join(D, "ZVT-2026-0*-HDL.LOG"))):
        s, sk = parse_hdl(f)
        s = [x for x in s if x["dt"] is not None]
        print(f"  {os.path.basename(f)}: {len(s)} genehmigte Kartenkaeufe  (uebersprungen: {dict(sk)})")
        alls += s
    alls.sort(key=lambda r: r["dt"])
    return alls

# ---------------------------------------------------------------- Matching
def build():
    print("Statistic.txt laden ...")
    stat = load_statistic()
    print(f"  {len(stat)} Verkaufszeilen, {stat[0]['dt'].date()} .. {stat[-1]['dt'].date()}")
    print("HDL-Logs laden ...")
    hdl = load_hdl()
    print(f"  {len(hdl)} genehmigte Kartenzahlungen gesamt")

    # ---- Kartenbelege je Kalendertag den Karten-Verkaufszeilen zuordnen.
    # Die PC-Uhr (Statistic) und die Terminal-Uhr (HDL) laufen ~20-140 s
    # auseinander, aber beide Listen sind zeitlich monoton und die Tages-
    # summen stimmen fast immer exakt. Also: pro Tag der Reihe nach paaren.
    hdl_by_day = collections.defaultdict(list)
    for h in hdl:
        hdl_by_day[h["dt"].date()].append(h)
    for d in hdl_by_day:
        hdl_by_day[d].sort(key=lambda x: x["dt"])
    stat_card_by_day = collections.defaultdict(list)
    for r in stat:
        if r["zahlart_code"] == "2":
            stat_card_by_day[r["dt"].date()].append(r)
    for d in stat_card_by_day:
        stat_card_by_day[d].sort(key=lambda x: x["dt"])

    # pairing: id(stat_row) -> hdl beleg ; plus leftover belege
    pair = {}
    leftover_belege = []
    for d, recs in hdl_by_day.items():
        sc = stat_card_by_day.get(d, [])
        if len(sc) == len(recs):
            for sr, hr in zip(sc, recs):
                pair[id(sr)] = hr
        elif len(sc) == 0:
            leftover_belege += recs
        else:
            # ungleiche Anzahl (HDL hat i.d.R. ein paar Belege mehr): ordnungs-
            # erhaltende Ausrichtung per DP, die die noetige Zahl HDL-Belege
            # ueberspringt und die Summe der Zeitabstaende minimiert.
            n, m = len(sc), len(recs)
            INF = float("inf")
            SKIP_B = 400.0   # Beleg ohne Verkaufszeile
            SKIP_S = 900.0   # Verkaufszeile ohne Beleg (teurer: Karte ohne Beleg-Detail)
            dp = [[INF] * (m + 1) for _ in range(n + 1)]
            bk = [[None] * (m + 1) for _ in range(n + 1)]
            dp[0][0] = 0.0
            for j in range(1, m + 1):
                dp[0][j] = dp[0][j - 1] + SKIP_B; bk[0][j] = "skipB"
            for i in range(1, n + 1):
                dp[i][0] = dp[i - 1][0] + SKIP_S; bk[i][0] = "skipS"
            for i in range(1, n + 1):
                for j in range(1, m + 1):
                    c = dp[i - 1][j - 1] + abs((recs[j - 1]["dt"] - sc[i - 1]["dt"]).total_seconds())
                    dp[i][j] = c; bk[i][j] = "match"
                    if dp[i][j - 1] + SKIP_B < dp[i][j]:
                        dp[i][j] = dp[i][j - 1] + SKIP_B; bk[i][j] = "skipB"
                    if dp[i - 1][j] + SKIP_S < dp[i][j]:
                        dp[i][j] = dp[i - 1][j] + SKIP_S; bk[i][j] = "skipS"
            i, j = n, m
            while i > 0 or j > 0:
                step = bk[i][j]
                if step == "match":
                    pair[id(sc[i - 1])] = recs[j - 1]; i -= 1; j -= 1
                elif step == "skipB":
                    leftover_belege.append(recs[j - 1]); j -= 1
                else:  # skipS
                    i -= 1
    # Tage mit Belegen aber ohne einzige Statistic-Kartenzeile
    for d, recs in hdl_by_day.items():
        if d not in stat_card_by_day:
            leftover_belege += recs

    ledger = []
    stats = collections.Counter()
    for r in stat:
        code = r["zahlart_code"]
        if code == "2":
            method = "karte"
        elif code == "1":
            method = "bar"
        elif code == "0":
            method = "unbekannt"
        else:
            method = "unbekannt"  # Altzeilen vor 2026-03 ohne Feld
        rec = dict(
            sold_at=r["dt"].isoformat(sep=" "),
            bild_nr=r["bild"],
            prints=r["prints"],
            method=method,
            method_source="automat_flag" if code in ("1", "2", "0") else "kein_flag",
            amount_cents=None,
            card_scheme=None,
            receipt_no=None,
            auth_code=None,
            pan_masked=None,
            match_delta_s=None,
            source_file="Statistic.txt",
        )
        if method == "karte":
            h = pair.get(id(r))
            if h:
                rec["amount_cents"] = h["amt_cents"]
                rec["card_scheme"] = h["scheme"]
                rec["receipt_no"] = h["beleg"]
                rec["auth_code"] = h["auth"]
                rec["pan_masked"] = h["pan"]
                rec["match_delta_s"] = round((h["dt"] - r["dt"]).total_seconds())
                rec["source_file"] = "Statistic.txt+" + h["src"]
                stats["karte_mit_beleg"] += 1
            else:
                rec["amount_cents"] = PARK_PRICE_CENTS  # Fixpreis-Fallback
                rec["method_source"] = "automat_flag_ohne_beleg"
                stats["karte_ohne_beleg"] += 1
        elif method == "bar":
            rec["amount_cents"] = PARK_PRICE_CENTS
            stats["bar"] += 1
        else:
            stats["unbekannt"] += 1
        ledger.append(rec)

    # Kartenbelege ohne zugehoerige Verkaufszeile: echtes Kartengeld, kein Foto
    # (Kunde hat gezahlt, Druck ging nicht raus / Kleinbetrag-Kontaktlos / Monatsgrenze)
    for h in leftover_belege:
        ledger.append(dict(
            sold_at=h["dt"].isoformat(sep=" "),
            bild_nr=None, prints=None,
            method="karte", method_source="beleg_ohne_verkaufszeile",
            amount_cents=h["amt_cents"], card_scheme=h["scheme"],
            receipt_no=h["beleg"], auth_code=h["auth"], pan_masked=h["pan"],
            match_delta_s=None, source_file=h["src"],
        ))
        stats["beleg_ohne_verkaufszeile"] += 1
    ledger.sort(key=lambda x: x["sold_at"])

    print(f"\nKartenbelege ohne Verkaufszeile (eigene Zeile): {len(leftover_belege)} von {len(hdl)}")
    print("Zuordnung:", dict(stats))

    # ---- Zusammenfassung je Monat + gesamt
    def summ(rows, label):
        n = len(rows)
        k = sum(1 for x in rows if x["method"] == "karte")
        b = sum(1 for x in rows if x["method"] == "bar")
        u = sum(1 for x in rows if x["method"] == "unbekannt")
        kc = sum(x["amount_cents"] or 0 for x in rows if x["method"] == "karte")
        bc = sum(x["amount_cents"] or 0 for x in rows if x["method"] == "bar")
        base = k + b if (k + b) else 1
        print(f"  {label:12}  n={n:5}  Karte={k:5} ({100*k/base:5.1f}%)  Bar={b:4} ({100*b/base:5.1f}%)  unbek={u:4}   Karte-Umsatz={kc/100:9.2f}  Bar-Umsatz={bc/100:8.2f}")

    print("\n=== Aufschluesselung ===")
    by_m = collections.defaultdict(list)
    for x in ledger:
        by_m[x["sold_at"][:7]].append(x)
    for m in sorted(by_m):
        summ(by_m[m], m)
    print("  " + "-" * 100)
    summ(ledger, "GESAMT")
    print("\n  (nur-2026, ab Automat-Flag verfuegbar:)")
    summ([x for x in ledger if x["sold_at"] >= "2026-03"], "2026-03+")

    # ---- Schreiben
    csv_path = os.path.join(OUT, "imst_ledger.csv")
    with open(csv_path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(ledger[0].keys()))
        w.writeheader()
        w.writerows(ledger)
    with open(os.path.join(OUT, "imst_ledger.json"), "w") as fh:
        json.dump(ledger, fh, ensure_ascii=False, indent=1)
    print(f"\ngeschrieben: {csv_path}  ({len(ledger)} Zeilen)")
    # match-delta Verteilung
    dl = [x["match_delta_s"] for x in ledger if x["match_delta_s"] is not None]
    if dl:
        dl.sort()
        print(f"match-delta s: min={dl[0]} median={dl[len(dl)//2]} p90={dl[int(len(dl)*0.9)]} max={dl[-1]}")

if __name__ == "__main__":
    build()
