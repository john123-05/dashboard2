import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';
import { loadSettings, normalizeSettings, parkTimezone, PERIODS, rankedRows, speedEnabled, todayIn, type Period } from '../_shared/speedCommon.ts';

/**
 * operator-speed (docs/AUSBAU_PLAN.md, SP3) – Speedmessung im Betreiber-Dashboard.
 *   GET  ?park_id=&period=&date=   -> { enabled, period, date, today, from, to, rows (mit id/email/claimId/hidden), total,
 *                                       stats: { count, fastest, slowest, average }, settings }
 *   POST { park_id, action: 'save_settings', settings }
 *   POST { park_id, action: 'hide' | 'unhide', result_id }   (Messfehler aus allen Listen nehmen)
 */
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/** Alle Messwerte eines Tages (auch nicht freigeschaltete Fahrten), solange die Fotos noch vorliegen. */
async function dayStats(parkId: string, date: string, timezone: string) {
  const from = new Date(new Date(`${date}T00:00:00Z`).getTime() - 14 * 3_600_000).toISOString();
  const to = new Date(new Date(`${date}T23:59:59Z`).getTime() + 14 * 3_600_000).toISOString();
  const { data } = await supabaseService.from('photos').select('speed_kmh, captured_at')
    .eq('park_id', parkId).eq('is_test', false).not('speed_kmh', 'is', null).gte('captured_at', from).lte('captured_at', to).limit(5000);
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  const speeds = ((data ?? []) as Array<{ speed_kmh: number; captured_at: string }>)
    .filter((row) => format.format(new Date(row.captured_at)) === date)
    .map((row) => Number(row.speed_kmh)).filter((v) => v > 0);
  if (speeds.length === 0) return { count: 0, fastest: null, slowest: null, average: null };
  return {
    count: speeds.length,
    fastest: Math.max(...speeds),
    slowest: Math.min(...speeds),
    average: Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10,
  };
}

export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const parkId = url.searchParams.get('park_id') ?? '';
      if (!UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);
      const auth = await requireOperatorForPark(req, parkId, ['speed']);
      if (!auth.ok) return json({ error: auth.message }, auth.status);

      const settings = await loadSettings(auth.parkId);
      const timezone = await parkTimezone(auth.parkId);
      const today = todayIn(timezone);
      const requested = url.searchParams.get('period') as Period;
      const period: Period = PERIODS.includes(requested) ? requested : 'day';
      const rawDate = url.searchParams.get('date') ?? '';
      const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate <= today ? rawDate : today;
      const enabled = await speedEnabled(auth.parkId);
      const result = enabled
        ? await rankedRows(auth.parkId, period, date, settings, { limit: 50, includeHidden: true })
        : { rows: [], total: 0, ...{ from: date, to: date } };
      return json({
        ok: true,
        data: {
          enabled, period, date, today, from: result.from, to: result.to, rows: result.rows, total: result.total,
          stats: await dayStats(auth.parkId, date, timezone), settings,
        },
      });
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const parkId = typeof body?.park_id === 'string' ? body.park_id : '';
    if (!body || !UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);
    const auth = await requireOperatorForPark(req, parkId, ['speed']);
    if (!auth.ok) return json({ error: auth.message }, auth.status);
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'save_settings') {
      const settings = normalizeSettings(body.settings);
      const { error } = await supabaseService.from('park_speed_settings').upsert(
        { park_id: auth.parkId, settings, updated_at: new Date().toISOString() }, { onConflict: 'park_id' },
      );
      return error ? json({ error: error.message }, 400) : json({ ok: true, data: { settings } });
    }
    if (action === 'hide' || action === 'unhide') {
      const id = typeof body.result_id === 'string' ? body.result_id : '';
      if (!UUID.test(id)) return json({ error: 'Invalid result_id' }, 400);
      const { error } = await supabaseService.from('park_speed_results').update({ hidden: action === 'hide' }).eq('id', id).eq('park_id', auth.parkId);
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Speed unavailable' }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
