import { handleOptions, json } from '../_shared/sameProjectAdminAuth.ts';
import { loadSettings, parkTimezone, PERIODS, rankedRows, speedEnabled, todayIn, type Period } from '../_shared/speedCommon.ts';

/**
 * park-leaderboard (docs/AUSBAU_PLAN.md, SP2) – öffentlich, für die Bestenlisten-Seiten aller Parks.
 *   POST/GET { park_id, period?: 'day'|'week'|'month'|'all', date?: 'YYYY-MM-DD' }
 *   -> { enabled, period, date, today, from, to, rows, total, champion, todayChampion, settings }
 * Liefert nur Anzeigename, Bild, Tempo und Zeit – nie E-Mail-Adressen.
 */
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) as Record<string, unknown> : {};
    const param = (key: string) => (typeof body[key] === 'string' ? String(body[key]) : url.searchParams.get(key) ?? '');
    const parkId = param('park_id');
    if (!UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);

    const settings = await loadSettings(parkId);
    const timezone = await parkTimezone(parkId);
    const today = todayIn(timezone);
    const publicSettings = {
      headline: settings.headline, subline: settings.subline, cta_title: settings.cta_title, cta_text: settings.cta_text,
      winner_text: settings.winner_text, instagram_handle: settings.instagram_handle, hashtag: settings.hashtag,
      prize_text: settings.prize_text, show_qr: settings.show_qr, auto_scroll: settings.auto_scroll, rows: settings.rows,
      periods: settings.periods,
    };
    if (!(await speedEnabled(parkId))) {
      return json({ enabled: false, period: 'day', date: today, today, from: today, to: today, rows: [], total: 0, champion: null, todayChampion: null, settings: publicSettings });
    }

    const requested = param('period') as Period;
    const period: Period = PERIODS.includes(requested) && settings.periods.includes(requested) ? requested : settings.periods[0] ?? 'day';
    const rawDate = param('date');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate <= today ? rawDate : today;

    const open = (row: { rank: number; speedKmh: number; capturedAt: string; day: string; displayName: string | null; avatarUrl: string | null }) => ({
      rank: row.rank, speedKmh: row.speedKmh, capturedAt: row.capturedAt, day: row.day, displayName: row.displayName, avatarUrl: row.avatarUrl,
    });
    const result = await rankedRows(parkId, period, date, settings, { limit: settings.rows });
    const todayBest = period === 'day' && date === today
      ? result.rows[0] ?? null
      : (await rankedRows(parkId, 'day', today, settings, { limit: 1 })).rows[0] ?? null;

    return json({
      enabled: true,
      period,
      date,
      today,
      from: result.from,
      to: result.to,
      rows: result.rows.map(open),
      total: result.total,
      champion: result.rows[0] ? open(result.rows[0]) : null,
      todayChampion: todayBest ? open(todayBest) : null,
      settings: publicSettings,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Leaderboard unavailable' }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
