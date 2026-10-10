"""Erzeugt die Migration `supabase/migrations/20261011100000_catalog.sql` (PK1, docs/AUSBAU_PLAN.md).

Die Tabellen werden mit den heutigen Preisen und Texten befüllt (alle 7 Sprachen aus `src/lib/i18n.tsx`),
damit das CRM genau das zeigt, was Kunden heute sehen. Nur einmal ausführen; die Migration ist idempotent
(`on conflict do nothing`), ändert also nichts, was im CRM schon bearbeitet wurde.

    python3 scripts/catalog_seed.py
"""
import ast, json, os, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LANGS = ['de', 'en', 'es', 'fr', 'it', 'nl', 'lv']
src = open(ROOT + '/src/lib/i18n.tsx').read()
starts = {l: src.index('\n  %s: {' % l) for l in LANGS}
order = sorted(LANGS, key=lambda l: starts[l])
TEXT = {}
for i, l in enumerate(order):
    end = starts[order[i + 1]] if i + 1 < len(order) else src.index('\n};', starts[l])
    block = src[starts[l]:end]
    for m in re.finditer(r"^\s+'([^']+)':\s*(\"(?:[^\"\\]|\\.)*\"|'(?:[^'\\]|\\.)*'),\s*$", block, re.M):
        try:
            TEXT.setdefault(m.group(1), {})[l] = ast.literal_eval(m.group(2))
        except Exception:
            pass


def tx(key):
    """Alle Sprachen eines Schlüssels; fehlt eine, bleibt sie weg (Rückfall im Dashboard)."""
    if key not in TEXT:
        raise SystemExit('Schlüssel fehlt: ' + key)
    return TEXT[key]


def lit(value):
    return "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'::jsonb"


def sql_str(value):
    return 'null' if value is None else "'" + str(value).replace("'", "''") + "'"


# ----------------------------------------------------------------------------- Pakete
# (key, grp, sort, price_cents, unit, term, free, setup, highlight, name, tagline, badge, price_note, bullets, excluded, meta)
SPEED_COMMON = [
    'speed.offer.hardware', 'speed.offer.free_hardware', 'speed.offer.setup', 'speed.offer.daily_stats',
    'speed.offer.ranking', 'speed.offer.guest_page', 'speed.offer.photo_speed', 'speed.offer.photo_code',
    'speed.offer.hosting', 'speed.offer.database', 'speed.offer.maintenance',
]
SW_POINTS = [
    'speed.offer.setup', 'speed.offer.photo_speed', 'speed.offer.photo_code', 'speed.offer.daily_stats',
    'speed.offer.ranking', 'speed.offer.guest_page', 'speed.offer.benefit_edit', 'speed.offer.benefit_analyse',
    'speed.offer.hosting', 'speed.offer.database', 'speed.offer.maintenance',
]
SHOP_POINTS = [
    'shop_pricing.point_design', 'shop_pricing.point_setup', 'shop_pricing.point_products',
    'shop_pricing.point_payments', 'shop_pricing.point_hosting', 'shop_pricing.point_database', 'shop_pricing.point_sales',
]
SHOP_FULL = [
    'shop_pricing.full_setup', 'shop_pricing.full_monthly', 'shop_pricing.full_hosting',
    'shop_pricing.full_shipping', 'shop_pricing.full_managed',
]

P = []
def pkg(key, grp, sort, **kw):
    P.append(dict(key=key, grp=grp, sort=sort, **kw))

pkg('basis', 'plan', 10, price=0, unit='month', name='plans.basis', tagline='plans.basis_note',
    bullets=['plans.b_ops', 'plans.b_system', 'plans.b_support', 'plans.b_team'],
    excluded=['plans.s_contacts', 'plans.s_survey', 'plans.s_pixel', 'plans.s_email'])
pkg('marketing_starter', 'plan', 20, price=4900, unit='month', name='plans.marketing_starter', tagline='plans.starter_note',
    bullets=['plans.s_all', 'plans.s_contacts', 'plans.s_survey', 'plans.s_pixel', 'plans.s_email', 'plans.s_team'],
    excluded=['plans.p_social', 'plans.p_review', 'plans.p_reports'])
pkg('marketing_pro', 'plan', 30, price=14900, unit='month', highlight=True, badge='plans.badge_popular',
    name='plans.marketing_pro', tagline='plans.pro_note',
    bullets=['plans.p_all', 'plans.p_social', 'plans.p_review', 'plans.p_email', 'plans.p_reports', 'plans.p_team'], excluded=[])

pkg('shop_monthly', 'shop', 10, price=9900, unit='month', setup=74900, name='shop_pricing.monthly_name',
    tagline='shop_pricing.setup_desc', bullets=SHOP_POINTS, excluded=['shop_pricing.full_shipping'])
pkg('shop_year', 'shop', 20, price=9900, unit='month', term=12, free=3, setup=74900, highlight=True,
    name='shop_pricing.yearly_name', badge='shop_pricing.yearly_badge', bullets=SHOP_POINTS, excluded=['shop_pricing.full_shipping'])
pkg('shop_full', 'shop', 30, price=0, unit='share', setup=0, name='shop_pricing.full_name', badge='shop_pricing.full_badge',
    tagline='shop_pricing.full_desc', bullets=SHOP_FULL, excluded=[], meta={'share_percent': 15})

pkg('speed_basis', 'speed', 10, price=14900, unit='month', term=12, name='speed.offer.plan_basic',
    bullets=SPEED_COMMON + ['speed.offer.term_12'], excluded=['speed.offer.display_large'])
pkg('speed_display', 'speed', 20, price=24900, unit='month', term=12, highlight=True, name='speed.offer.plan_display',
    badge='speed.offer.popular', bullets=SPEED_COMMON + ['speed.offer.display_large', 'speed.offer.display_free', 'speed.offer.display_year2', 'speed.offer.term_12'],
    excluded=[], meta={'year2_cents': 14900})
pkg('speed_long', 'speed', 30, price=9900, unit='month', term=48, name='speed.offer.plan_long', badge='speed.offer.value',
    bullets=SPEED_COMMON + ['speed.offer.long_price', 'speed.offer.long_fixed', 'speed.offer.term_48'], excluded=['speed.offer.display_large'])

pkg('software_monthly', 'software', 10, price=4900, unit='month', term=12, name='speed.offer.sw_plan_monthly',
    bullets=SW_POINTS, excluded=['speed.offer.display_large'], meta={'display_cents': 9900})
pkg('software_year', 'software', 20, price=4900, unit='month', term=12, free=3, highlight=True, name='speed.offer.sw_plan_year',
    badge='speed.offer.sw_free_months', bullets=SW_POINTS, excluded=['speed.offer.display_large'], meta={'display_cents': 9900})
pkg('software_two_years', 'software', 30, price=4900, unit='month', term=24, free=6, name='speed.offer.sw_plan_two_years',
    badge='speed.offer.sw_free_months', bullets=SW_POINTS, excluded=['speed.offer.display_large'], meta={'display_cents': 9900})

pkg('addon_shop', 'addon', 10, name='pp.addon_shop_title', tagline='pp.addon_shop_text', price_note='pp.addon_shop_price')
pkg('addon_speed', 'addon', 20, name='pp.addon_speed_title', tagline='pp.addon_speed_text', price_note='pp.addon_speed_price')
pkg('addon_mail', 'addon', 30, name='pp.addon_mail_title', tagline='pp.addon_mail_text', price_note='pp.addon_mail_price')
pkg('addon_hardware', 'addon', 40, name='pp.addon_hw_title', tagline='pp.addon_hw_text', price_note='pp.price_on_request')

# ----------------------------------------------------------------------------- Vergleichszeilen
# (grp, labelKey, kind, cells (je Paket in Reihenfolge), soon)
T, F = True, False
ROWS = []
def rows(grp, pkgs, items):
    for i, item in enumerate(items):
        label, kind, cells, soon = (item + (None, False))[:4] if len(item) < 4 else item
        ROWS.append(dict(grp=grp, sort=(i + 1) * 10, label=label, kind=kind, cells=dict(zip(pkgs, cells or [])), soon=bool(soon)))

PLANS3 = ['basis', 'marketing_starter', 'marketing_pro']
rows('plan', PLANS3, [
    ('plans.row_operations', 'text', [T, T, T]),
    ('plans.row_team', 'text', ['3', '10', 'plans.unlimited']),
    ('plans.row_contacts', 'text', [F, T, T]),
    ('plans.row_survey', 'text', [F, T, T]),
    ('plans.row_pixel', 'text', [F, T, T]),
    ('plans.row_email', 'text', [F, '2.000', '10.000']),
    ('pp.row_segments', 'text', [F, T, T]),
    ('pp.row_automations', 'text', [F, F, T]),
    ('plans.row_social', 'text', [F, 'plans.cell_share_unlock', 'plans.cell_campaigns']),
    ('plans.row_review', 'text', [F, F, T]),
    ('plans.row_reports', 'text', [F, F, T], True),
    ('plans.row_rights', 'text', [F, F, T]),
    ('pp.row_guides', 'text', [T, T, T]),
    ('pp.row_addon_shop', 'text', ['pp.cell_addon'] * 3),
    ('pp.row_addon_speed', 'text', ['pp.cell_addon'] * 3),
])
SHOP3 = ['shop_monthly', 'shop_year', 'shop_full']
rows('shop', SHOP3, [(k, 'text', [T, T, T]) for k in SHOP_POINTS[:1]] + [(k, 'text', [T, T, T]) for k in SHOP_POINTS[1:]] + [
    ('shop_pricing.full_shipping', 'text', [F, F, T]),
    ('pp.row_setup_cost', 'setup', []),
    ('pp.row_monthly', 'monthly', []),
    ('pp.row_prepay', 'prepay', []),
    ('pp.row_share', 'share', []),
])
SPEED3 = ['speed_basis', 'speed_display', 'speed_long']
rows('speed', SPEED3, [(k, 'text', [T, T, T]) for k in [
    'speed.offer.free_hardware', 'speed.offer.setup', 'speed.offer.photo_speed', 'speed.offer.photo_code', 'speed.offer.daily_stats',
    'speed.offer.ranking', 'speed.offer.guest_page', 'speed.offer.benefit_edit', 'speed.offer.benefit_analyse',
    'speed.offer.hosting', 'speed.offer.database', 'speed.offer.maintenance']] + [
    ('speed.offer.display_large', 'text', [F, T, F]),
    ('pp.row_monthly', 'monthly', []),
    ('pp.row_year2', 'year2', []),
    ('pp.row_term', 'term', []),
])
SW3 = ['software_monthly', 'software_year', 'software_two_years']
rows('software', SW3, [(k, 'text', [T, T, T]) for k in SW_POINTS] + [
    ('pp.row_monthly', 'monthly', []),
    ('pp.row_display_monthly', 'display_monthly', []),
    ('pp.row_term', 'term', []),
    ('pp.row_free_months', 'free_months', []),
    ('pp.row_prepay', 'prepay', []),
])

# ----------------------------------------------------------------------------- SQL
out = ["""-- PK1 (docs/AUSBAU_PLAN.md): Katalog der Pakete, Preise und Vergleichszeilen – im Liftpictures-CRM pflegbar,
-- im Betreiber-Dashboard nur gelesen. Shared-Projekt kvpcwlcfgmsmarjtwpsx. Nur Service Role (Edge Functions).
-- Erzeugt mit scripts/catalog_seed.py (befüllt mit den heutigen Preisen und Texten, alle 7 Sprachen).
create table if not exists public.catalog_packages (
  key text primary key,
  grp text not null check (grp in ('plan', 'shop', 'speed', 'software', 'system', 'addon')),
  sort int not null default 0,
  active boolean not null default true,
  highlight boolean not null default false,
  price_cents int,
  price_unit text not null default 'month' check (price_unit in ('month', 'once', 'share')),
  term_months int,
  free_months int not null default 0,
  setup_cents int,
  texts jsonb not null default '{}'::jsonb,      -- { de:{name,tagline,badge,price_note}, en:{…}, … }
  bullets jsonb not null default '[]'::jsonb,    -- [{ texts:{de:'…',en:'…'}, included:true }]
  meta jsonb not null default '{}'::jsonb,       -- share_percent, year2_cents, display_cents
  updated_at timestamptz not null default now(),
  updated_by text
);
create table if not exists public.catalog_points (
  key text primary key,                           -- '<grp>.<labelKey>'
  grp text not null,
  sort int not null default 0,
  kind text not null default 'text' check (kind in ('text', 'setup', 'monthly', 'prepay', 'share', 'year2', 'term', 'free_months', 'display_monthly')),
  soon boolean not null default false,
  texts jsonb not null default '{}'::jsonb,       -- { de:'…', en:'…' }
  active boolean not null default true
);
create table if not exists public.catalog_package_points (
  package_key text not null references public.catalog_packages(key) on delete cascade,
  point_key text not null references public.catalog_points(key) on delete cascade,
  included boolean not null default false,
  value jsonb,                                    -- null oder { de:'…', en:'…' } statt Haken
  primary key (package_key, point_key)
);
create table if not exists public.catalog_history (
  id bigserial primary key,
  package_key text,
  changed_by text,
  changed_at timestamptz not null default now(),
  before jsonb,
  after jsonb
);
alter table public.catalog_packages enable row level security;
alter table public.catalog_points enable row level security;
alter table public.catalog_package_points enable row level security;
alter table public.catalog_history enable row level security;
revoke all on table public.catalog_packages, public.catalog_points, public.catalog_package_points, public.catalog_history from public, anon, authenticated;
"""]

for p in P:
    texts = {}
    for l in LANGS:
        d = {}
        for field in ('name', 'tagline', 'badge', 'price_note'):
            key = p.get(field)
            if key and l in tx(key):
                d[field] = tx(key)[l]
        texts[l] = d
    bullets = [{'texts': tx(k), 'included': True} for k in p.get('bullets', [])] + \
              [{'texts': tx(k), 'included': False} for k in p.get('excluded', [])]
    out.append(
        "insert into public.catalog_packages (key, grp, sort, highlight, price_cents, price_unit, term_months, free_months, setup_cents, texts, bullets, meta) values "
        "(%s, %s, %d, %s, %s, %s, %s, %d, %s, %s, %s, %s) on conflict (key) do nothing;" % (
            sql_str(p['key']), sql_str(p['grp']), p['sort'], 'true' if p.get('highlight') else 'false',
            'null' if p.get('price') is None else p['price'], sql_str(p.get('unit', 'month')),
            'null' if p.get('term') is None else p['term'], p.get('free', 0),
            'null' if p.get('setup') is None else p['setup'], lit(texts), lit(bullets), lit(p.get('meta', {}))))

def cell_value(cell):
    """True/False -> (included, None); Text -> (True, {lang: text})"""
    if cell is True: return True, None
    if cell is False: return False, None
    if re.match(r'^[a-z][a-z0-9_]*\.[a-z0-9_.]+$', cell) and cell in TEXT:
        return True, tx(cell)
    return True, {l: cell for l in LANGS}

seen = set()
for r in ROWS:
    key = '%s.%s' % (r['grp'], r['label'])
    if key in seen:
        continue
    seen.add(key)
    out.append("insert into public.catalog_points (key, grp, sort, kind, soon, texts) values (%s, %s, %d, %s, %s, %s) on conflict (key) do nothing;" % (
        sql_str(key), sql_str(r['grp']), r['sort'], sql_str(r['kind']), 'true' if r['soon'] else 'false', lit(tx(r['label']))))
    for pk, cell in r['cells'].items():
        included, value = cell_value(cell)
        out.append("insert into public.catalog_package_points (package_key, point_key, included, value) values (%s, %s, %s, %s) on conflict do nothing;" % (
            sql_str(pk), sql_str(key), 'true' if included else 'false', 'null' if value is None else lit(value)))

open(ROOT + '/supabase/migrations/20261011100000_catalog.sql', 'w').write('\n'.join(out) + '\n')
print('Pakete:', len(P), 'Zeilen:', len(seen))
