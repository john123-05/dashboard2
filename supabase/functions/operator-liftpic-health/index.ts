import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-liftpic-health
 *
 * Read-only view of one park's kiosk PCs: what the machine measured about
 * itself (`probes`), what its log files say (`devices`), what it can be asked
 * to do (`restartable`, `can_test_photo`), how money moved through it
 * (`coin_inventory`, `payments`), whether its claim code is registered
 * (`customer_code_registered`), and the lasting record (`history`).
 *
 * Writes nothing. The underlying tables are RLS-locked without policies, so the
 * customer dashboard cannot reach them directly.
 */

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function minutesSince(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.round((Date.now() - then) / 60000);
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  const parkId = text(url.searchParams.get('park_id'));
  if (!parkId) return json({ error: 'park_id fehlt' }, 400);

  const auth = await requireOperatorForPark(req, parkId);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const { data: machines, error } = await supabaseService
    .from('liftpic_machine_configs')
    .select('id, machine_id, machine_label, camera_code, last_seen_at, is_active, last_status, settings')
    .eq('park_id', auth.parkId)
    .eq('is_active', true)
    .order('machine_label', { ascending: true });

  if (error) return json({ error: error.message }, 400);

  // Which claim-code numbers are registered for this park.
  //
  // This is what decides where an uploaded photo ends up: the database trigger
  // reads the number out of the FILENAME and looks it up here. Finds nothing,
  // it falls back to the bucket mapping - and the shared bucket points at
  // someone else's park. On 15.08.2026 exactly that happened: the machine wrote
  // 1234, only 7623 was registered, and the photo landed in another park.
  // Nothing anywhere made that visible beforehand. Now it does.
  const registrierte = new Set<string>();
  try {
    const { data: cams } = await supabaseService
      .from('park_cameras')
      .select('customer_code')
      .eq('park_id', auth.parkId)
      .eq('is_active', true);
    for (const c of cams ?? []) {
      const code = text((c as { customer_code: unknown }).customer_code);
      if (code) registrierte.add(code);
    }
  } catch (_err) {
    // Kann die Liste nicht gelesen werden, wird nichts behauptet.
  }

  let history: unknown[] = [];
  let historyAvailable = true;
  try {
    const { data, error: historyError } = await supabaseService
      .from('liftpic_machine_health_events')
      .select('id, machine_id, occurred_at, kind, severity, summary, detail')
      .eq('park_id', auth.parkId)
      .order('occurred_at', { ascending: false })
      .limit(100);
    if (historyError) historyAvailable = false;
    else history = data || [];
  } catch (_err) {
    historyAvailable = false;
  }

  const result = (machines || []).map((m: Record<string, unknown>) => {
    const status = (m.last_status ?? {}) as Record<string, unknown>;
    const settings = (m.settings ?? {}) as Record<string, unknown>;
    const offlineMinutes = minutesSince(m.last_seen_at);

    // Die Nummer, die der Automat wirklich in die Dateinamen schreibt. Aeltere
    // Staende melden sie nicht - dann wird nichts geprueft und nichts behauptet.
    const customerCode = text(status.customer_code);
    const codeGeprueft = customerCode !== '' && registrierte.size > 0;

    return {
      id: m.id,
      machine_id: m.machine_id,
      machine_label: m.machine_label,
      camera_code: m.camera_code,
      last_seen_at: m.last_seen_at,
      offline_minutes: offlineMinutes,
      reachable: offlineMinutes !== null && offlineMinutes <= 5,
      probes: list(status.probes),
      devices: list(status.operational_devices),
      restartable: list(status.restartable),
      can_test_photo: status.can_test_photo === true,
      // Wie die Kamera eingestellt ist - Belichtung, Verstaerkung, Farbe.
      // Rein lesend, kommt unveraendert aus dem Herzschlag. Meldet ein Automat
      // nichts, steht hier null und das Dashboard zeigt keine Kameraseite,
      // statt eine leere zu bauen. (F-045)
      camera_settings: status.camera_settings ?? null,
      restart_poll_seconds:
        typeof status.restart_poll_seconds === 'number' ? status.restart_poll_seconds : null,
      night_window: Array.isArray(status.night_window) ? status.night_window : null,
      // Abholcode: welche Nummer der Automat benutzt, welche der Park kennt,
      // und ob das zusammenpasst. `null` heisst "nicht pruefbar", nicht "in
      // Ordnung" - der Unterschied ist wichtig.
      customer_code: customerCode || null,
      park_customer_codes: [...registrierte].sort(),
      customer_code_registered: codeGeprueft ? registrierte.has(customerCode) : null,
      coin_inventory: status.coin_inventory ?? null,
      coin_warnings: list(status.coin_warnings),
      coin_payout_failures: list(status.coin_payout_failures),
      payments: status.payments ?? null,
      payments_days: status.payments_days ?? null,
      prices_cent: list(status.prices_cent),
      monitored_sources: status.monitored_sources ?? null,
      faults_now: status.faults_now ?? null,
      warnings_now: status.warnings_now ?? null,
      pending_health_events: status.pending_health_events ?? null,
      agent_version: status.agent_version ?? null,
      queue_count: status.queue_count ?? null,
      disk_free_mb: status.disk_free_mb ?? null,
      paper_remaining: status.paper_remaining ?? null,
      photos_taken_today: status.photos_taken_today ?? null,
      photos_sold_today: status.photos_sold_today ?? null,
      photo_conversion_today: status.photo_conversion_today ?? null,
      pending_restart: settings.pending_restart ?? null,
      last_restart_at: settings.last_restart_at ?? null,
    };
  });

  return json({
    ok: true,
    data: { machines: result, history, history_available: historyAvailable },
  });
});
