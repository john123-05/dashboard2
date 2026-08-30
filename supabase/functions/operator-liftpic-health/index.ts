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

  // Rueckwirkende, protokoll-genaue Zahlungszuordnung je Kauf aus
  // machine_sale_payments (Automat-Kennzeichen 2=Karte / 1=Bar plus hobex-
  // Haendlerbeleg fuer Betrag + Kartenmarke). Wenn die Tabelle fuer diesen
  // Park Zeilen hat, reicht sie weiter zurueck als der Herzschlag und nennt
  // die Kartenmarke - das Dashboard bevorzugt sie dann vor status.payments.
  const LEDGER_TAGE = 30;
  const ledgerByMachine = new Map<string, Record<string, unknown>>();
  try {
    const seit = new Date(Date.now() - LEDGER_TAGE * 86_400_000).toISOString();
    const { data: sp } = await supabaseService
      .from('machine_sale_payments')
      .select('machine_id, sold_at, sold_local, bild_nr, method, method_source, amount_cents, card_scheme, receipt_no')
      .eq('park_id', auth.parkId)
      .gte('sold_at', seit)
      .order('sold_at', { ascending: false })
      .limit(6000);

    const proMaschine = new Map<string, Record<string, unknown>[]>();
    for (const row of sp ?? []) {
      const mid = text((row as { machine_id: unknown }).machine_id);
      if (!mid) continue;
      if (!proMaschine.has(mid)) proMaschine.set(mid, []);
      proMaschine.get(mid)!.push(row as Record<string, unknown>);
    }

    for (const [mid, rows] of proMaschine) {
      let barAnzahl = 0, barCent = 0, karteAnzahl = 0, karteCent = 0, unbekanntAnzahl = 0;
      const marken = new Map<string, { anzahl: number; cent: number }>();
      for (const r of rows) {
        const art = text(r.method);
        const cent = typeof r.amount_cents === 'number' ? r.amount_cents : 0;
        if (art === 'bar') { barAnzahl++; barCent += cent; }
        else if (art === 'karte') {
          karteAnzahl++; karteCent += cent;
          const marke = text(r.card_scheme) || 'ohne Angabe';
          const m = marken.get(marke) ?? { anzahl: 0, cent: 0 };
          m.anzahl++; m.cent += cent;
          marken.set(marke, m);
        } else { unbekanntAnzahl++; }
      }
      const erkannt = barAnzahl + karteAnzahl;
      const gesamt = erkannt + unbekanntAnzahl;
      // Anteil nur zeigen, wenn genug erkannt wurde - sonst null (F-037),
      // nicht "0 %".
      const genugErkannt = gesamt > 0 && erkannt / gesamt >= 0.5;

      const letzte = rows.slice(0, 400).map((r) => {
        const art = text(r.method);
        const hinweis = art === 'unbekannt'
          ? (text(r.method_source) === 'kein_flag'
              ? 'Vor der Zahlungsart-Erkennung des Automaten - nicht mehr feststellbar.'
              : 'Automat hat keine Zahlungsart gemeldet.')
          : '';
        return {
          zeit: text(r.sold_at),
          foto: text(r.bild_nr),
          bildnummer: /^\d+$/.test(text(r.bild_nr)) ? Number(text(r.bild_nr)) : null,
          betrag_cent: typeof r.amount_cents === 'number' ? r.amount_cents : 0,
          zahlungsart: art,
          kartenmarke: text(r.card_scheme) || null,
          beleg_nr: text(r.receipt_no) || null,
          eingeworfen_cent: 0,
          ausgezahlt_cent: 0,
          erwartetes_wechselgeld_cent: 0,
          abweichung_cent: 0,
          sicher: text(r.method_source) === 'automat_flag',
          hinweis,
        };
      });

      ledgerByMachine.set(mid, {
        zeitraum_tage: LEDGER_TAGE,
        bar_anzahl: barAnzahl,
        bar_cent: barCent,
        karte_anzahl: karteAnzahl,
        karte_cent: karteCent,
        unbekannt_anzahl: unbekanntAnzahl,
        bar_anteil: genugErkannt ? barAnzahl / erkannt : null,
        karte_anteil: genugErkannt ? karteAnzahl / erkannt : null,
        erkannt_anteil: gesamt > 0 ? erkannt / gesamt : null,
        kartenmarken: [...marken.entries()]
          .map(([marke, v]) => ({ marke, anzahl: v.anzahl, cent: v.cent }))
          .sort((a, b) => b.anzahl - a.anzahl),
        auffaellig: [],
        letzte,
        unzugeordnet: [],
      });
    }
  } catch (_err) {
    // Tabelle evtl. noch leer oder nicht vorhanden - dann bleibt es beim
    // Herzschlag-Wert (status.payments).
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
      // Rueckwirkende Log-Auswertung schlaegt den Herzschlag-Wert, wenn
      // vorhanden: sie reicht weiter zurueck und nennt die Kartenmarke.
      payments: ledgerByMachine.get(text(m.machine_id)) ?? status.payments ?? null,
      payments_source: ledgerByMachine.has(text(m.machine_id)) ? 'ledger' : 'heartbeat',
      payments_days:
        (ledgerByMachine.get(text(m.machine_id))?.zeitraum_tage as number | undefined) ??
        status.payments_days ??
        null,
      heartbeat_payments: status.payments ?? null,
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
