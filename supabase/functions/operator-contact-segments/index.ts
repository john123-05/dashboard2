import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-contact-segments (docs/PRODUKT_PLAN.md, C3) – Segmente = von Hand zusammengestellte Kontaktlisten.
 *   GET  ?park_id=                       -> { segments: [{ id, name, member_count }] }
 *   GET  ?park_id=&segment_id=           -> { claim_ids: [...] }
 *   POST { park_id, action: 'create', name }                       -> { id }
 *   POST { park_id, action: 'rename', segment_id, name }
 *   POST { park_id, action: 'delete', segment_id }
 *   POST { park_id, action: 'add', segment_id, claim_ids }          (nur Freischaltungen dieses Parks)
 *   POST { park_id, action: 'remove', segment_id, claim_ids }
 */
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;

const text = (value: unknown, max = 80) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const ids = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.map((v) => String(v)).filter((v) => UUID.test(v)))].slice(0, 5000) : [];
const missingTable = (error: { code?: string } | null) => error?.code === '42P01' || error?.code === 'PGRST205';

async function ownsSegment(parkId: string, segmentId: string): Promise<boolean> {
  if (!UUID.test(segmentId)) return false;
  const { data } = await supabaseService.from('park_contact_segments').select('id').eq('id', segmentId).eq('park_id', parkId).maybeSingle();
  return Boolean(data);
}

export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const parkId = text(url.searchParams.get('park_id'), 40);
      if (!UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);
      const auth = await requireOperatorForPark(req, parkId, ['marketing']);
      if (!auth.ok) return json({ error: auth.message }, auth.status);
      const segmentId = text(url.searchParams.get('segment_id'), 40);
      if (segmentId) {
        if (!(await ownsSegment(auth.parkId, segmentId))) return json({ error: 'Segment nicht gefunden.' }, 404);
        const { data } = await supabaseService.from('park_contact_segment_members').select('claim_id').eq('segment_id', segmentId).limit(50000);
        return json({ ok: true, data: { claim_ids: ((data ?? []) as Row[]).map((r) => String(r.claim_id)) } });
      }
      const { data: segments, error } = await supabaseService.from('park_contact_segments').select('id, name').eq('park_id', auth.parkId).order('name');
      if (missingTable(error)) return json({ ok: true, data: { segments: [], migration_pending: true } });
      if (error) return json({ error: error.message }, 500);
      const list = (segments ?? []) as Row[];
      const counts = new Map<string, number>();
      if (list.length > 0) {
        const { data: members } = await supabaseService.from('park_contact_segment_members').select('segment_id').in('segment_id', list.map((s) => String(s.id))).limit(100000);
        for (const m of (members ?? []) as Row[]) counts.set(String(m.segment_id), (counts.get(String(m.segment_id)) ?? 0) + 1);
      }
      return json({ ok: true, data: { segments: list.map((s) => ({ id: s.id, name: s.name, member_count: counts.get(String(s.id)) ?? 0 })) } });
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const body = await req.json().catch(() => null) as Row | null;
    const parkId = text(body?.park_id, 40);
    if (!body || !UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);
    const auth = await requireOperatorForPark(req, parkId, ['marketing']);
    if (!auth.ok) return json({ error: auth.message }, auth.status);
    const action = text(body.action, 20);

    if (action === 'create') {
      const name = text(body.name);
      if (!name) return json({ error: 'Bitte einen Namen eingeben.' }, 400);
      const { data, error } = await supabaseService.from('park_contact_segments').insert({ park_id: auth.parkId, name }).select('id').single();
      if (error) return json({ error: error.code === '23505' ? 'Ein Segment mit diesem Namen gibt es schon.' : error.message }, 400);
      return json({ ok: true, data: { id: data.id } });
    }

    const segmentId = text(body.segment_id, 40);
    if (!(await ownsSegment(auth.parkId, segmentId))) return json({ error: 'Segment nicht gefunden.' }, 404);

    if (action === 'rename') {
      const name = text(body.name);
      if (!name) return json({ error: 'Bitte einen Namen eingeben.' }, 400);
      const { error } = await supabaseService.from('park_contact_segments').update({ name }).eq('id', segmentId);
      return error ? json({ error: error.code === '23505' ? 'Ein Segment mit diesem Namen gibt es schon.' : error.message }, 400) : json({ ok: true });
    }
    if (action === 'delete') {
      const { error } = await supabaseService.from('park_contact_segments').delete().eq('id', segmentId);
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    if (action === 'add' || action === 'remove') {
      const claimIds = ids(body.claim_ids);
      if (claimIds.length === 0) return json({ error: 'Keine Kontakte ausgewählt.' }, 400);
      if (action === 'remove') {
        const { error } = await supabaseService.from('park_contact_segment_members').delete().eq('segment_id', segmentId).in('claim_id', claimIds);
        return error ? json({ error: error.message }, 400) : json({ ok: true, data: { removed: claimIds.length } });
      }
      // Nur Freischaltungen dieses Parks zulassen.
      const valid: string[] = [];
      for (let i = 0; i < claimIds.length; i += 200) {
        const { data } = await supabaseService.from('photo_claims').select('id').eq('park_id', auth.parkId).in('id', claimIds.slice(i, i + 200));
        for (const row of (data ?? []) as Row[]) valid.push(String(row.id));
      }
      if (valid.length === 0) return json({ error: 'Keine passenden Kontakte.' }, 400);
      const { error } = await supabaseService.from('park_contact_segment_members').upsert(
        valid.map((claim_id) => ({ segment_id: segmentId, claim_id })),
        { onConflict: 'segment_id,claim_id', ignoreDuplicates: true },
      );
      return error ? json({ error: error.message }, 400) : json({ ok: true, data: { added: valid.length } });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Segments unavailable' }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
