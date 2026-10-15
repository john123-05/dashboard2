import { handleOptions, json, requireAdminFromRequest, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { isExpoSubscription, sendPushToSubscriptions } from '../_shared/webpush.ts';

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
      // Wohin: alle Geräte, nur die iOS-App oder nur Browser; optional nur ein Benutzer.
      const channel = text(body.channel, 10) || 'all';
      const userId = text(body.user_id, 40);
      if (!['all', 'app', 'web'].includes(channel)) return json({ error: 'Ungültiger Kanal.' }, 400);
      if (userId && !UUID.test(userId)) return json({ error: 'Ungültiger Benutzer.' }, 400);
      let query = supabaseService.from('operator_push_subscriptions').select('endpoint, p256dh, auth_key');
      if (parkId) query = query.eq('park_id', parkId);
      if (userId) query = query.eq('operator_user_id', userId);
      const { data: alle, error } = await query.limit(5000);
      if (error) return json({ error: error.message }, 500);
      const subscriptions = (alle ?? []).filter((s) => channel === 'all' || (channel === 'app') === isExpoSubscription(s));
      if (!subscriptions || subscriptions.length === 0) return json({ ok: true, data: { sent: 0, devices: 0 } });
      const url = link(body.url);
      const payload = JSON.stringify({ title, body: text(body.body, 300), url: url && url.startsWith('/') ? url : '/' });
      const { sent, goneEndpoints } = await sendPushToSubscriptions(subscriptions, payload);
      if (goneEndpoints.length > 0) await supabaseService.from('operator_push_subscriptions').delete().in('endpoint', goneEndpoints);
      return json({ ok: true, data: { sent, devices: subscriptions.length } });
    }

    // Welche Geräte gibt es für einen Park (für die Auswahl im CRM)?
    if (action === 'push_devices') {
      const parkId = text(body.park_id, 40);
      if (!parkId || !UUID.test(parkId)) return json({ error: 'Ungültiger Park.' }, 400);
      const { data, error } = await supabaseService
        .from('operator_push_subscriptions')
        .select('operator_user_id, endpoint')
        .eq('park_id', parkId)
        .limit(2000);
      if (error) return json({ error: error.message }, 500);
      const byUser = new Map<string, { operator_user_id: string; app: number; web: number }>();
      for (const row of data ?? []) {
        const e = byUser.get(row.operator_user_id) ?? { operator_user_id: row.operator_user_id, app: 0, web: 0 };
        if (isExpoSubscription(row)) e.app += 1;
        else e.web += 1;
        byUser.set(row.operator_user_id, e);
      }
      return json({ ok: true, data: { users: [...byUser.values()] } });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Announcements unavailable' }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
