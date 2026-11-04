import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-presentation
 *
 * Der Betreiber gestaltet die "Liftpictures Presentation" (2. Monitor am
 * Automaten) selbst - im Dashboard unter Personalisierung.
 *
 *   GET  ?park_id=…   Automaten des Parks mit freigeschalteter Presentation:
 *                     Gestaltung, Grundwerte des Verkaufsprogramms, Status.
 *   POST {park_id, machine_config_id, design}   Gestaltung speichern.
 *
 * Nur die GESTALTUNG ist hier aenderbar. Freischaltung, Lizenzdatum und QR-Link
 * bleiben im Liftpictures-CRM (admin-liftpic-machines). Speichern geht nur,
 * wenn die Presentation fuer den Automaten freigeschaltet ist.
 *
 * Der Agent (presentation_design.py) prueft jeden Wert noch einmal gegen feste
 * Grenzen - hier wird nur Form und Groesse begrenzt.
 *
 * verify_jwt = false: der Operator-Token kommt aus dem anderen Projekt und wird
 * hier selbst geprueft (wie operator-liftpic-camera).
 */

const MAX_JSON = 16000;
const KEY = /^[a-z][a-z0-9_]{0,40}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function plainValue(v: unknown): boolean {
  return typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 400)
    || (Array.isArray(v) && v.length <= 8 && v.every((x) => typeof x === 'string' && x.length <= 140));
}

function plainDesign(d: unknown): d is Record<string, unknown> {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  for (const [k, v] of Object.entries(d)) {
    if (!KEY.test(k) || k === 'schedule' || !plainValue(v)) return false;
    if (k === 'logo_url' && v !== '' && !(typeof v === 'string' && v.startsWith('https://'))) return false;
  }
  return true;
}

// Gestaltung mit optionalem Zeitplan (bis zu 6 Eintraege, jeder mit eigenem Design).
export function validDesign(d: unknown): string | null {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'Ungültige Gestaltung.';
  if (JSON.stringify(d).length > MAX_JSON) return 'Gestaltung ist zu groß.';
  const { schedule, ...rest } = d as Record<string, unknown>;
  if (!plainDesign(rest)) return 'Ungültige Gestaltung.';
  if (schedule === undefined) return null;
  if (!Array.isArray(schedule) || schedule.length > 6) return 'Ungültiger Zeitplan.';
  for (const p of schedule) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return 'Ungültiger Zeitplan.';
    const e = p as Record<string, unknown>;
    if (!TIME.test(String(e.from)) || !TIME.test(String(e.to))) return 'Zeitplan: Uhrzeit als HH:MM.';
    if (e.name !== undefined && (typeof e.name !== 'string' || e.name.length > 40)) return 'Zeitplan: Name zu lang.';
    if (e.days !== undefined && !(Array.isArray(e.days) && e.days.length <= 7 && e.days.every((x) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 6))) return 'Zeitplan: ungültige Tage.';
    if (!plainDesign(e.design)) return 'Zeitplan: ungültige Gestaltung.';
  }
  return null;
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
      .select('id, machine_id, machine_label, is_active, settings, last_status, last_seen_at')
      .eq('park_id', auth.parkId);
    if (error) return json({ error: error.message }, 400);

    const machines = (data ?? [])
      .filter((m) => (m.settings as Record<string, unknown> | null)?.presentation_enabled === true)
      .map((m) => {
        const s = (m.settings ?? {}) as Record<string, unknown>;
        const st = (m.last_status ?? {}) as Record<string, unknown>;
        return {
          id: m.id,
          machine_id: m.machine_id,
          machine_label: m.machine_label,
          design: s.presentation_design ?? null,
          logo_url: s.station_logo_url ?? null,
          viewer_settings: st.viewer_settings ?? null,
          status: st.presentation ?? null,
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
  const problem = validDesign(body.design);
  if (problem) return json({ error: problem }, 400);

  const { data: machine, error: readError } = await supabaseService
    .from('liftpic_machine_configs')
    .select('id, park_id, settings')
    .eq('id', machineConfigId)
    .maybeSingle();
  if (readError) return json({ error: readError.message }, 400);
  if (!machine) return json({ error: 'Automat nicht gefunden' }, 404);
  if (machine.park_id !== auth.parkId) return json({ error: 'Dieser Automat gehört nicht zu deinem Park' }, 403);
  const settings = (machine.settings ?? {}) as Record<string, unknown>;
  if (settings.presentation_enabled !== true) {
    return json({ error: 'Die Presentation ist für diesen Automaten nicht freigeschaltet.' }, 403);
  }

  const { error } = await supabaseService
    .from('liftpic_machine_configs')
    .update({ settings: { ...settings, presentation_design: body.design } })
    .eq('id', machineConfigId);
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
});
