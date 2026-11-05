import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-kiosk
 *
 * Der Betreiber stellt das Verkaufsprogramm (Liftpictures Kiosk) am Automaten
 * selbst ein - im Dashboard unter Personalisierung - aber nur die Teile, die
 * Liftpictures im CRM fuer ihn freigegeben hat (settings.kiosk_customer_edit).
 *
 *   GET  ?park_id=…     Automaten des Parks mit freigeschaltetem Verkaufsprogramm:
 *                       Einstellungen, freigegebene Teile, Stand vom PC.
 *   POST {park_id, machine_config_id, config}          Einstellungen speichern.
 *                       Uebernommen werden nur die freigegebenen Teile; alles
 *                       andere bleibt, wie Liftpictures es eingestellt hat.
 *   POST {park_id, machine_config_id, action:'vouchers', kind, day, photos, count}
 *                       Gutschein-Codes erzeugen (Schluessel bleibt auf dem Server).
 *
 * Freischaltung und Lizenz bleiben im CRM (admin-liftpic-machines).
 * verify_jwt = false: der Operator-Token kommt aus dem anderen Projekt und wird
 * hier selbst geprueft (wie operator-presentation).
 */

type Obj = Record<string, unknown>;

// Teil -> Pfade in den Einstellungen, die der Kunde damit aendern darf.
const PARTS: Record<string, string[][]> = {
  prices: [['products', 'print', 'price'], ['products', 'digital', 'price'], ['products', 'combo', 'price'], ['packages'], ['currency']],
  texts: [['park_name'], ['attract', 'headline'], ['attract', 'subline']],
  design: [['theme']],
  languages: [['language'], ['languages'], ['time_format']],
  find: [['find']],
  express: [['express']],
  vouchers: [],
};

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

const KC_KEY = /^[a-z][a-z0-9_]{0,40}$/;
const KC_TOP = ['park_name', 'currency', 'language', 'languages', 'time_format', 'rotation', 'performance', 'express', 'theme', 'attract',
  'find', 'products', 'packages', 'payments', 'cash', 'devices', 'links', 'idle_seconds', 'help_seconds', 'admin_pin', 'print', 'vouchers'];
function kcValue(v: unknown, depth: number): boolean {
  if (v === null || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v) && Math.abs(v) <= 10_000_000;
  if (typeof v === 'string') return v.length <= 500 && !/[<>]/.test(v);
  if (Array.isArray(v)) return v.length <= 30 && v.every((x) => kcValue(x, depth + 1));
  if (typeof v === 'object' && depth < 4) return Object.entries(v as Obj).every(([k, x]) => KC_KEY.test(k) && kcValue(x, depth + 1));
  return false;
}
export function validKioskConfig(d: unknown): string | null {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'Ungültige Einstellungen.';
  if (JSON.stringify(d).length > 32000) return 'Einstellungen sind zu groß.';
  for (const [k, v] of Object.entries(d as Obj)) if (!KC_TOP.includes(k) || !kcValue(v, 1)) return `Ungültiger Wert: ${k}`;
  const c = d as { theme?: Obj; links?: Obj };
  for (const u of [c.theme?.logo, c.theme?.background, ...Object.values(c.links ?? {})]) {
    if (u != null && u !== '' && !(typeof u === 'string' && u.startsWith('https://'))) return 'Adressen müssen mit https:// beginnen.';
  }
  return null;
}

function getPath(o: unknown, path: string[]): unknown {
  let cur = o;
  for (const p of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Obj)[p];
  }
  return cur;
}
function setPath(o: Obj, path: string[], value: unknown) {
  let cur = o;
  for (const p of path.slice(0, -1)) {
    if (!cur[p] || typeof cur[p] !== 'object' || Array.isArray(cur[p])) {
      if (value === undefined) return; // nichts zu loeschen
      cur[p] = {};
    }
    cur = cur[p] as Obj;
  }
  const last = path[path.length - 1];
  if (value === undefined) delete cur[last]; else cur[last] = value;
}

/** Nur die freigegebenen Teile aus `wanted` in `current` uebernehmen. */
export function applyAllowed(current: Obj, wanted: Obj, allowed: string[]): Obj {
  const out = structuredClone(current ?? {}) as Obj;
  for (const part of allowed) for (const path of PARTS[part] ?? []) setPath(out, path, structuredClone(getPath(wanted, path)));
  return out;
}

// Gutschein-Codes - gleicher Algorithmus wie kiosk_app/src/vouchers.ts (der Automat prueft offline).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EPOCH = Date.UTC(2024, 0, 1);
function dayChars(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const n = ((Math.floor((Date.UTC(y, m - 1, d) - EPOCH) / 86_400_000) % 1024) + 1024) % 1024;
  return ALPHABET[Math.floor(n / 32)] + ALPHABET[n % 32];
}
async function check(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  return ALPHABET[sig[0] % 32] + ALPHABET[sig[1] % 32] + ALPHABET[sig[2] % 32];
}
async function makeVoucher(secret: string, kind: 'day' | 'photos', day: string, photos: number): Promise<string> {
  const rnd = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALPHABET[b % 32]).join('');
  const body = kind === 'day' ? 'D' + dayChars(day) + rnd(2) : 'P' + ALPHABET[Math.max(1, Math.min(9, photos)) - 1] + rnd(3);
  return body + (await check(secret, body));
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method === 'GET') {
    const parkId = text(new URL(req.url).searchParams.get('park_id'));
    if (!parkId) return json({ error: 'park_id fehlt' }, 400);
    const auth = await requireOperatorForPark(req, parkId);
    if (!auth.ok) return json({ error: auth.message }, auth.status);
    const { data, error } = await supabaseService
      .from('liftpic_machine_configs')
      .select('id, machine_id, machine_label, settings, last_status, last_seen_at')
      .eq('park_id', auth.parkId);
    if (error) return json({ error: error.message }, 400);
    const machines = (data ?? [])
      .filter((m) => (m.settings as Obj | null)?.kiosk_enabled === true)
      .map((m) => {
        const s = (m.settings ?? {}) as Obj;
        const st = (m.last_status ?? {}) as Obj;
        const config = structuredClone((s.kiosk_config ?? {}) as Obj);
        // Der Gutschein-Schluessel bleibt auf dem Server.
        const vouchers = config.vouchers as Obj | undefined;
        const hasVouchers = !!vouchers?.secret;
        if (vouchers) delete vouchers.secret;
        return {
          id: m.id,
          machine_id: m.machine_id,
          machine_label: m.machine_label,
          config,
          has_vouchers: hasVouchers,
          allowed: Array.isArray(s.kiosk_customer_edit) ? s.kiosk_customer_edit : [],
          valid_until: s.kiosk_valid_until || null,
          status: st.kiosk ?? null,
          last_seen_at: m.last_seen_at,
        };
      });
    return json({ ok: true, data: machines });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: 'Ungültiger Inhalt' }, 400);
  const parkId = text(body.park_id);
  if (!parkId) return json({ error: 'park_id fehlt' }, 400);
  const auth = await requireOperatorForPark(req, parkId);
  if (!auth.ok) return json({ error: auth.message }, auth.status);
  const machineConfigId = text(body.machine_config_id);
  if (!machineConfigId) return json({ error: 'Automat fehlt' }, 400);

  const { data: machine, error: readError } = await supabaseService
    .from('liftpic_machine_configs')
    .select('id, park_id, settings')
    .eq('id', machineConfigId)
    .maybeSingle();
  if (readError) return json({ error: readError.message }, 400);
  if (!machine) return json({ error: 'Automat nicht gefunden' }, 404);
  if (machine.park_id !== auth.parkId) return json({ error: 'Dieser Automat gehört nicht zu deinem Park' }, 403);
  const settings = (machine.settings ?? {}) as Obj;
  if (settings.kiosk_enabled !== true) return json({ error: 'Das Verkaufsprogramm ist für diesen Automaten nicht freigeschaltet.' }, 403);
  const allowed = (Array.isArray(settings.kiosk_customer_edit) ? settings.kiosk_customer_edit : []).map(String).filter((p) => p in PARTS);
  const current = (settings.kiosk_config ?? {}) as Obj;

  if (body.action === 'vouchers') {
    if (!allowed.includes('vouchers')) return json({ error: 'Gutscheine sind für deinen Park nicht freigegeben.' }, 403);
    const secret = String((current.vouchers as Obj | undefined)?.secret ?? '');
    if (!secret) return json({ error: 'Gutscheine sind am Automaten noch nicht eingerichtet – bitte Liftpictures fragen.' }, 409);
    const kind = body.kind === 'photos' ? 'photos' : 'day';
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(body.day)) ? String(body.day) : new Date().toISOString().slice(0, 10);
    const count = Math.max(1, Math.min(500, Number(body.count) || 1));
    const codes: string[] = [];
    for (let i = 0; i < count; i++) codes.push(await makeVoucher(secret, kind, day, Math.round(Number(body.photos) || 1)));
    return json({ ok: true, codes });
  }

  if (!allowed.length) return json({ error: 'Für deinen Park sind keine Einstellungen freigegeben.' }, 403);
  if (!body.config || typeof body.config !== 'object' || Array.isArray(body.config)) return json({ error: 'Ungültige Einstellungen' }, 400);
  const next = applyAllowed(current, body.config as Obj, allowed);
  const problem = validKioskConfig(next);
  if (problem) return json({ error: problem }, 400);
  const { error } = await supabaseService
    .from('liftpic_machine_configs')
    .update({ settings: { ...settings, kiosk_config: next } })
    .eq('id', machineConfigId);
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
});
