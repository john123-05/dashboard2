import { handleOptions, json, requireAdminFromRequest, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { sendPushToSubscriptions } from '../_shared/webpush.ts';

/**
 * admin-park-announcements (docs/AUSBAU_PLAN.md, HW1) – nur Staff (admin_users), für die CRM-Seite „Hinweise“.
 *   GET                                  -> { announcements: [… + seen, clicked, dismissed] }
 *   POST { action: 'save', announcement } -> anlegen/ändern
 *   POST { action: 'delete', id }
 *   POST { action: 'push', park_id | null, title, body, url? } -> Push an alle Geräte des Parks (oder aller Parks)
 */
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center'];
const AUDIENCES = ['all', 'owner', 'staff'];
const TONES = ['info', 'offer', 'warning'];
const PAGES = [
  'overview', 'revenue', 'purchases', 'photos', 'personalization', 'health', 'kamera', 'marketing',
  'shop', 'speed', 'configuration', 'tickets', 'settings', 'team', 'plans', 'ratgeber',
];
type Row = Record<string, unknown>;

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
function link(value: unknown): string | null {
  const v = text(value, 500);
  if (!v) return null;
  if (v.startsWith('/')) return v;                // Seite im Dashboard
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}
function iso(value: unknown): string | null {
  const v = text(value, 40);
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    const auth = await requireAdminFromRequest(req);
    if (!auth.ok) return json({ error: auth.message }, auth.status);

    if (req.method === 'GET') {
      const { data, error } = await supabaseService.from('park_announcements').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) return json({ error: error.message }, 503);
      const list = (data ?? []) as Row[];
      const counts = new Map<string, { seen: number; clicked: number; dismissed: number }>();
      if (list.length > 0) {
        const { data: events } = await supabaseService.from('park_announcement_events').select('announcement_id, event')
          .in('announcement_id', list.map((a) => String(a.id))).limit(50000);
        for (const e of (events ?? []) as Row[]) {
          const c = counts.get(String(e.announcement_id)) ?? { seen: 0, clicked: 0, dismissed: 0 };
          const key = String(e.event) as 'seen' | 'clicked' | 'dismissed';
          if (key in c) c[key] += 1;
          counts.set(String(e.announcement_id), c);
        }
      }
      return json({ ok: true, data: { announcements: list.map((a) => ({ ...a, ...(counts.get(String(a.id)) ?? { seen: 0, clicked: 0, dismissed: 0 }) })) } });
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const body = await req.json().catch(() => null) as Row | null;
    if (!body) return json({ error: 'Invalid payload' }, 400);
    const action = text(body.action, 20);

    if (action === 'save') {
      const a = (body.announcement ?? {}) as Row;
      const title = text(a.title, 120);
      if (!title) return json({ error: 'Bitte einen Titel eingeben.' }, 400);
      const parkId = text(a.park_id, 40);
      if (parkId && !UUID.test(parkId)) return json({ error: 'Ungültiger Park.' }, 400);
      const position = text(a.position, 20) || 'bottom-right';
      const audience = text(a.audience, 10) || 'all';
      const tone = text(a.tone, 10) || 'info';
      if (!POSITIONS.includes(position) || !AUDIENCES.includes(audience) || !TONES.includes(tone)) return json({ error: 'Ungültige Auswahl.' }, 400);
      const startsAt = iso(a.starts_at);
      const endsAt = iso(a.ends_at);
      if (startsAt && endsAt && endsAt <= startsAt) return json({ error: 'Das Ende muss nach dem Start liegen.' }, 400);
      const row = {
        park_id: parkId || null,
        title,
        body: text(a.body, 1000),
        cta_label: text(a.cta_label, 60) || null,
        cta_url: link(a.cta_url),
        qr_url: link(a.qr_url),
        position,
        pages: Array.isArray(a.pages) ? [...new Set(a.pages.map((p) => String(p)).filter((p) => PAGES.includes(p)))] : [],
        audience,
        tone,
        starts_at: startsAt,
        ends_at: endsAt,
        active: a.active !== false,
        updated_at: new Date().toISOString(),
      };
      const id = text(a.id, 40);
      if (id && !UUID.test(id)) return json({ error: 'Ungültiger Hinweis.' }, 400);
      const { data, error } = id
        ? await supabaseService.from('park_announcements').update(row).eq('id', id).select('id').maybeSingle()
        : await supabaseService.from('park_announcements').insert(row).select('id').single();
      return error ? json({ error: error.message }, 400) : json({ ok: true, data: { id: data?.id ?? id } });
    }

    if (action === 'delete') {
      const id = text(body.id, 40);
      if (!UUID.test(id)) return json({ error: 'Ungültiger Hinweis.' }, 400);
      const { error } = await supabaseService.from('park_announcements').delete().eq('id', id);
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }

    if (action === 'push') {
      const title = text(body.title, 120);
      if (!title) return json({ error: 'Bitte einen Titel eingeben.' }, 400);
      const parkId = text(body.park_id, 40);
      if (parkId && !UUID.test(parkId)) return json({ error: 'Ungültiger Park.' }, 400);
      let query = supabaseService.from('operator_push_subscriptions').select('endpoint, p256dh, auth_key');
      if (parkId) query = query.eq('park_id', parkId);
      const { data: subscriptions, error } = await query.limit(5000);
      if (error) return json({ error: error.message }, 500);
      if (!subscriptions || subscriptions.length === 0) return json({ ok: true, data: { sent: 0, devices: 0 } });
      const url = link(body.url);
      const payload = JSON.stringify({ title, body: text(body.body, 300), url: url && url.startsWith('/') ? url : '/' });
      const { sent, goneEndpoints } = await sendPushToSubscriptions(subscriptions, payload);
      if (goneEndpoints.length > 0) await supabaseService.from('operator_push_subscriptions').delete().in('endpoint', goneEndpoints);
      return json({ ok: true, data: { sent, devices: subscriptions.length } });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Announcements unavailable' }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
