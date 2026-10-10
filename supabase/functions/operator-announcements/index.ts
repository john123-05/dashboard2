import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-announcements (docs/AUSBAU_PLAN.md, HW1): Hinweise aus dem Liftpictures-CRM im Betreiber-Dashboard.
 *   GET  ?park_id=…                              -> { announcements: [...] } (aktiv, im Zeitraum, vom Nutzer nicht geschlossen)
 *   POST { park_id, announcement_id, event }     -> 'seen' | 'clicked' | 'dismissed' (je Nutzer einmal gezählt)
 */
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const EVENTS = ['seen', 'clicked', 'dismissed'];
type Row = Record<string, unknown>;

export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    if (req.method === 'GET') {
      const parkId = new URL(req.url).searchParams.get('park_id') ?? '';
      if (!UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);
      const auth = await requireOperatorForPark(req, parkId);
      if (!auth.ok) return json({ error: auth.message }, auth.status);

      const { data, error } = await supabaseService.from('park_announcements')
        .select('id, park_id, title, body, cta_label, cta_url, qr_url, position, pages, audience, tone, starts_at, ends_at')
        .eq('active', true)
        .or(`park_id.eq.${auth.parkId},park_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error?.code === '42P01' || error?.code === 'PGRST205') return json({ ok: true, data: { announcements: [] } });
      if (error) return json({ error: 'Announcements unavailable' }, 503);

      const now = Date.now();
      const current = ((data ?? []) as Row[]).filter((a) =>
        (!a.starts_at || Date.parse(String(a.starts_at)) <= now) && (!a.ends_at || Date.parse(String(a.ends_at)) >= now)
      );
      let dismissed = new Set<string>();
      if (current.length > 0) {
        const { data: events } = await supabaseService.from('park_announcement_events')
          .select('announcement_id').eq('park_id', auth.parkId).eq('user_id', auth.userId).eq('event', 'dismissed')
          .in('announcement_id', current.map((a) => String(a.id)));
        dismissed = new Set(((events ?? []) as Row[]).map((e) => String(e.announcement_id)));
      }
      return json({ ok: true, data: { announcements: current.filter((a) => !dismissed.has(String(a.id))) } });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null) as Row | null;
      const parkId = typeof body?.park_id === 'string' ? body.park_id : '';
      const announcementId = typeof body?.announcement_id === 'string' ? body.announcement_id : '';
      const event = typeof body?.event === 'string' ? body.event : '';
      if (!UUID.test(parkId) || !UUID.test(announcementId) || !EVENTS.includes(event)) return json({ error: 'Invalid payload' }, 400);
      const auth = await requireOperatorForPark(req, parkId);
      if (!auth.ok) return json({ error: auth.message }, auth.status);
      const { data: announcement } = await supabaseService.from('park_announcements').select('id, park_id').eq('id', announcementId).maybeSingle();
      if (!announcement || (announcement.park_id && announcement.park_id !== auth.parkId)) return json({ error: 'Not found' }, 404);
      await supabaseService.from('park_announcement_events').upsert(
        { announcement_id: announcementId, park_id: auth.parkId, user_id: auth.userId, event },
        { onConflict: 'announcement_id,park_id,user_id,event', ignoreDuplicates: true },
      );
      return json({ ok: true });
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch {
    return json({ error: 'Announcements unavailable' }, 503);
  }
}

if (import.meta.main) Deno.serve(handler);
