import { handleOptions, json, requireAdminFromRequest, supabaseService } from '../_shared/sameProjectAdminAuth.ts';

/**
 * admin-catalog (docs/AUSBAU_PLAN.md, PK2) – nur Staff (admin_users), für die CRM-Seite „Pakete & Preise“.
 *   GET                                   -> { packages, points, cells, history }   (alles, auch inaktive)
 *   POST { action: 'save_package', package }                  anlegen/ändern (Preise, Texte, Punkte-Liste)
 *   POST { action: 'save_point', point }                      Vergleichszeile anlegen/ändern
 *   POST { action: 'delete_point', key }
 *   POST { action: 'set_cell', package_key, point_key, included, value? }   Häkchen/Text einer Zelle
 *   GET ?park_id=…  zusätzlich { overrides }  Rabatte dieses Kunden;  GET ohne park_id: { promotions (mit Zählern) }
 *   POST { action: 'save_override' | 'delete_override', override }                 Rabatt je Kunde (PK4)
 *   POST { action: 'save_promotion' | 'delete_promotion', promotion }              Aktionen (PK5)
 * Jede Änderung wird in catalog_history festgehalten (wer, wann, vorher, nachher).
 */
const GROUPS = ['plan', 'shop', 'speed', 'software', 'system', 'addon'];
const UNITS = ['month', 'once', 'share'];
const KINDS = ['text', 'setup', 'monthly', 'prepay', 'share', 'year2', 'term', 'free_months', 'display_monthly'];
const LANGS = ['de', 'en', 'es', 'fr', 'it', 'nl', 'lv'];
const KEY = /^[a-z][a-z0-9_.]{1,80}$/;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown, min = 0, max = 10_000_000): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/** { de:'…', en:'…' } bereinigen: nur bekannte Sprachen, Text gekürzt, leere weg. */
function cleanTexts(value: unknown, fields: string[] | null): Row {
  const out: Row = {};
  if (!value || typeof value !== 'object') return out;
  for (const lang of LANGS) {
    const entry = (value as Row)[lang];
    if (fields === null) {
      const text = str(entry, 600);
      if (text) out[lang] = text;
    } else if (entry && typeof entry === 'object') {
      const part: Row = {};
      for (const f of fields) {
        const text = str((entry as Row)[f], 600);
        if (text) part[f] = text;
      }
      if (Object.keys(part).length) out[lang] = part;
    }
  }
  return out;
}

/**
 * Wurde der deutsche Text geändert, die übersetzte Fassung aber nicht angefasst, ist sie veraltet: weg damit,
 * das Dashboard zeigt dann den deutschen Text. Wer eine Übersetzung mitschickt, behält sie.
 */
function dropStaleLanguages(before: unknown, after: Row, fields: string[] | null): Row {
  const b = (before && typeof before === 'object' ? before : {}) as Row;
  const out: Row = JSON.parse(JSON.stringify(after));
  const pick = (source: Row, lang: string, field: string | null): string =>
    field === null ? str(source[lang], 600) : str(((source[lang] ?? {}) as Row)[field], 600);
  const names: (string | null)[] = fields ?? [null];
  for (const field of names) {
    if (pick(b, 'de', field) === pick(out, 'de', field)) continue;
    for (const lang of LANGS) {
      if (lang === 'de') continue;
      if (pick(out, lang, field) && pick(out, lang, field) === pick(b, lang, field)) {
        if (field === null) delete out[lang];
        else delete ((out[lang] ?? {}) as Row)[field];
      }
    }
  }
  return out;
}

async function log(actor: string, packageKey: string | null, before: unknown, after: unknown) {
  await supabaseService.from('catalog_history').insert({ package_key: packageKey, changed_by: actor, before, after });
}

export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    const auth = await requireAdminFromRequest(req);
    if (!auth.ok) return json({ error: auth.message }, auth.status);
    const { data: who } = await supabaseService.auth.admin.getUserById(auth.userId);
    const actor = who?.user?.email ?? auth.userId;

    if (req.method === 'GET') {
      const parkParam = new URL(req.url).searchParams.get('park_id');
      if (parkParam) {
        if (!UUID.test(parkParam)) return json({ error: 'Invalid park_id' }, 400);
        const [overrides, packages, promotions] = await Promise.all([
          supabaseService.from('park_price_overrides').select('*').eq('park_id', parkParam).order('created_at', { ascending: false }),
          supabaseService.from('catalog_packages').select('key, grp, price_cents, price_unit, texts').order('grp').order('sort'),
          supabaseService.from('catalog_promotions').select('id, name, discount_percent, free_months, package_keys, audience, starts_on, ends_on, active'),
        ]);
        for (const r of [overrides, packages, promotions]) if (r.error) return json({ error: r.error.message }, 503);
        return json({ ok: true, data: { overrides: overrides.data, packages: packages.data, promotions: promotions.data } });
      }
      const [packages, points, cells, history] = await Promise.all([
        supabaseService.from('catalog_packages').select('*').order('grp').order('sort'),
        supabaseService.from('catalog_points').select('*').order('grp').order('sort'),
        supabaseService.from('catalog_package_points').select('*'),
        supabaseService.from('catalog_history').select('*').order('changed_at', { ascending: false }).limit(60),
      ]);
      for (const r of [packages, points, cells, history]) if (r.error) return json({ error: r.error.message }, 503);
      const promos = await supabaseService.from('catalog_promotions').select('*').order('created_at', { ascending: false });
      const events = promos.error ? { data: [] as Row[] } : await supabaseService.from('catalog_promotion_events').select('promotion_id, event').limit(50000);
      const counts = new Map<string, { seen: number; requested: number; booked: number }>();
      for (const e of (events.data ?? []) as Row[]) {
        const c = counts.get(String(e.promotion_id)) ?? { seen: 0, requested: 0, booked: 0 };
        const key = String(e.event) as 'seen' | 'requested' | 'booked';
        if (key in c) c[key] += 1;
        counts.set(String(e.promotion_id), c);
      }
      const promotions = ((promos.data ?? []) as Row[]).map((p) => ({ ...p, ...(counts.get(String(p.id)) ?? { seen: 0, requested: 0, booked: 0 }) }));
      return json({ ok: true, data: { packages: packages.data, points: points.data, cells: cells.data, history: history.data, promotions } });
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const body = await req.json().catch(() => null) as Row | null;
    if (!body) return json({ error: 'Invalid body' }, 400);

    if (body.action === 'save_package') {
      const p = (body.package ?? {}) as Row;
      const key = str(p.key, 80);
      if (!KEY.test(key)) return json({ error: 'Ungültiger Schlüssel (Kleinbuchstaben, Zahlen, _ und .).' }, 400);
      const grp = str(p.grp, 20);
      if (!GROUPS.includes(grp)) return json({ error: 'Ungültige Gruppe' }, 400);
      const unit = UNITS.includes(String(p.price_unit)) ? String(p.price_unit) : 'month';
      const { data: before } = await supabaseService.from('catalog_packages').select('*').eq('key', key).maybeSingle();
      const texts = dropStaleLanguages(before?.texts, cleanTexts(p.texts, ['name', 'tagline', 'badge', 'price_note']), ['name', 'tagline', 'badge', 'price_note']);
      if (!(texts.de as Row | undefined)?.name) return json({ error: 'Der deutsche Name ist Pflicht.' }, 400);
      const oldBullets = (Array.isArray(before?.bullets) ? before.bullets : []) as Row[];
      const bullets = (Array.isArray(p.bullets) ? p.bullets : []).slice(0, 40).map((b, i) => ({
        texts: dropStaleLanguages(oldBullets[i]?.texts, cleanTexts((b as Row)?.texts, null), null), included: (b as Row)?.included !== false,
      })).filter((b) => Object.keys(b.texts).length > 0);
      const meta: Row = {};
      for (const f of ['share_percent', 'year2_cents', 'display_cents']) {
        const n = int((p.meta as Row | undefined)?.[f]);
        if (n !== null) meta[f] = n;
      }
      const row = {
        key, grp, sort: int(p.sort, 0, 10000) ?? 0, active: p.active !== false, highlight: p.highlight === true,
        price_cents: int(p.price_cents), price_unit: unit, term_months: int(p.term_months, 1, 120),
        free_months: int(p.free_months, 0, 60) ?? 0, setup_cents: int(p.setup_cents),
        texts, bullets, meta, updated_at: new Date().toISOString(), updated_by: actor,
      };
      const { error } = await supabaseService.from('catalog_packages').upsert(row, { onConflict: 'key' });
      if (error) return json({ error: error.message }, 503);
      await log(actor, key, before, row);
      return json({ ok: true, data: row });
    }

    if (body.action === 'save_point') {
      const p = (body.point ?? {}) as Row;
      const key = str(p.key, 100);
      if (!KEY.test(key)) return json({ error: 'Ungültiger Schlüssel' }, 400);
      const grp = str(p.grp, 20);
      if (!GROUPS.includes(grp)) return json({ error: 'Ungültige Gruppe' }, 400);
      const kind = KINDS.includes(String(p.kind)) ? String(p.kind) : 'text';
      const { data: before } = await supabaseService.from('catalog_points').select('*').eq('key', key).maybeSingle();
      const texts = dropStaleLanguages(before?.texts, cleanTexts(p.texts, null), null);
      if (!texts.de) return json({ error: 'Der deutsche Text ist Pflicht.' }, 400);
      const row = { key, grp, sort: int(p.sort, 0, 10000) ?? 0, kind, soon: p.soon === true, active: p.active !== false, texts };
      const { error } = await supabaseService.from('catalog_points').upsert(row, { onConflict: 'key' });
      if (error) return json({ error: error.message }, 503);
      await log(actor, null, before, { point: row });
      return json({ ok: true, data: row });
    }

    if (body.action === 'delete_point') {
      const key = str(body.key, 100);
      const { data: before } = await supabaseService.from('catalog_points').select('*').eq('key', key).maybeSingle();
      const { error } = await supabaseService.from('catalog_points').delete().eq('key', key);
      if (error) return json({ error: error.message }, 503);
      await log(actor, null, before, { point_deleted: key });
      return json({ ok: true });
    }

    if (body.action === 'set_cell') {
      const packageKey = str(body.package_key, 80);
      const pointKey = str(body.point_key, 100);
      const included = body.included === true;
      const { data: before } = await supabaseService.from('catalog_package_points').select('*').eq('package_key', packageKey).eq('point_key', pointKey).maybeSingle();
      const value = body.value ? dropStaleLanguages(before?.value, cleanTexts(body.value, null), null) : null;
      const row = { package_key: packageKey, point_key: pointKey, included, value: value && Object.keys(value).length ? value : null };
      const { error } = await supabaseService.from('catalog_package_points').upsert(row, { onConflict: 'package_key,point_key' });
      if (error) return json({ error: error.message }, 503);
      await log(actor, packageKey, before, { cell: row });
      return json({ ok: true, data: row });
    }

    if (body.action === 'save_override') {
      const o = (body.override ?? {}) as Row;
      const parkId = str(o.park_id, 40);
      const packageKey = str(o.package_key, 80);
      if (!UUID.test(parkId) || !KEY.test(packageKey)) return json({ error: 'Kunde und Paket wählen.' }, 400);
      const percent = int(o.discount_percent, 1, 100);
      const fixed = int(o.fixed_price_cents, 0, 10_000_000);
      const extra = int(o.extra_free_months, 0, 36) ?? 0;
      if (percent === null && fixed === null && extra === 0) return json({ error: 'Rabatt in %, Festpreis oder geschenkte Monate eintragen.' }, 400);
      const until = typeof o.valid_until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.valid_until) ? o.valid_until : null;
      const row = {
        park_id: parkId, package_key: packageKey, discount_percent: fixed !== null ? null : percent, fixed_price_cents: fixed,
        extra_free_months: extra, note: str(o.note, 300) || null, valid_until: until, active: o.active !== false, created_by: actor,
      };
      const { data: before } = await supabaseService.from('park_price_overrides').select('*').eq('park_id', parkId).eq('package_key', packageKey).maybeSingle();
      const { error } = await supabaseService.from('park_price_overrides').upsert(row, { onConflict: 'park_id,package_key' });
      if (error) return json({ error: error.message }, 503);
      await log(actor, packageKey, before, { override: row });
      return json({ ok: true, data: row });
    }

    if (body.action === 'delete_override') {
      const id = str(body.id, 40);
      if (!UUID.test(id)) return json({ error: 'Invalid id' }, 400);
      const { data: before } = await supabaseService.from('park_price_overrides').select('*').eq('id', id).maybeSingle();
      const { error } = await supabaseService.from('park_price_overrides').delete().eq('id', id);
      if (error) return json({ error: error.message }, 503);
      await log(actor, (before?.package_key as string | undefined) ?? null, before, { override_deleted: id });
      return json({ ok: true });
    }

    if (body.action === 'save_promotion') {
      const p = (body.promotion ?? {}) as Row;
      const name = str(p.name, 120);
      if (!name) return json({ error: 'Name fehlt.' }, 400);
      const percent = int(p.discount_percent, 1, 100);
      const free = int(p.free_months, 0, 36) ?? 0;
      if (percent === null && free === 0) return json({ error: 'Rabatt in % oder geschenkte Monate eintragen.' }, 400);
      const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
      const a = (p.audience ?? { all: true }) as Row;
      const audience = Array.isArray(a.park_ids) && a.park_ids.length
        ? { park_ids: a.park_ids.filter((x) => typeof x === 'string' && UUID.test(x)) }
        : Array.isArray(a.plans) && a.plans.length
          ? { plans: a.plans.filter((x) => ['basis', 'marketing_starter', 'marketing_pro'].includes(String(x))) }
          : { all: true };
      const rawTexts = cleanTexts(p.texts, ['title', 'banner']);
      const id = str(p.id, 40);
      const row: Row = {
        name, texts: rawTexts, discount_percent: percent, free_months: free,
        package_keys: (Array.isArray(p.package_keys) ? p.package_keys : []).map((k) => str(k, 80)).filter((k) => KEY.test(k)),
        audience, starts_on: date(p.starts_on), ends_on: date(p.ends_on), active: p.active !== false,
      };
      if (UUID.test(id)) {
        const { data: before } = await supabaseService.from('catalog_promotions').select('*').eq('id', id).maybeSingle();
        row.texts = dropStaleLanguages(before?.texts, rawTexts, ['title', 'banner']);
        const { error } = await supabaseService.from('catalog_promotions').update(row).eq('id', id);
        if (error) return json({ error: error.message }, 503);
        await log(actor, null, before, { promotion: { id, ...row } });
        return json({ ok: true, data: { id, ...row } });
      }
      row.created_by = actor;
      const { data, error } = await supabaseService.from('catalog_promotions').insert(row).select('id').single();
      if (error) return json({ error: error.message }, 503);
      await log(actor, null, null, { promotion: { id: data.id, ...row } });
      return json({ ok: true, data: { id: data.id, ...row } });
    }

    if (body.action === 'delete_promotion') {
      const id = str(body.id, 40);
      if (!UUID.test(id)) return json({ error: 'Invalid id' }, 400);
      const { data: before } = await supabaseService.from('catalog_promotions').select('*').eq('id', id).maybeSingle();
      const { error } = await supabaseService.from('catalog_promotions').delete().eq('id', id);
      if (error) return json({ error: error.message }, 503);
      await log(actor, null, before, { promotion_deleted: id });
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Catalog unavailable' }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
