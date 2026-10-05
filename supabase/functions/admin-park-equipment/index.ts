import { handleOptions, json, requireAdminFromRequest, supabaseService } from '../_shared/sameProjectAdminAuth.ts';

/**
 * admin-park-equipment
 *
 * Staff-Pflege der "Konfiguration/Shop"-Liste je Park (park_equipment_items).
 * Lesen laeuft direkt per Client (RLS fuer admin_users), nur Schreiben geht
 * hier ueber Service-Role, gleiches Muster wie admin-park-cameras.
 *
 *   POST   { id?, park_id, kategorie, titel, beschreibung?, status,
 *            geschaetzter_mehrumsatz_cents?, sortierung? } -> Anlegen/Aendern
 *            (mit id: Update; ohne id: Insert)
 *   DELETE ?id=...                                          -> Loeschen
 */

const KATEGORIEN = ['Automat', 'Kamera', 'Zubehoer', 'Software', 'Sonstiges'];
const STATUS = ['vorhanden', 'empfohlen', 'bestellt'];

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function oneOf(value: unknown, allowed: string[], fallback: string): string {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  if (req.method === 'POST') {
    const payload = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) return json({ error: 'Invalid JSON body' }, 400);

    const parkId = text(payload.park_id);
    const titel = text(payload.titel);
    if (!parkId) return json({ error: 'Park fehlt' }, 400);
    if (!titel) return json({ error: 'Titel fehlt' }, 400);

    const row = {
      park_id: parkId,
      kategorie: oneOf(payload.kategorie, KATEGORIEN, 'Sonstiges'),
      titel,
      beschreibung: text(payload.beschreibung) || null,
      status: oneOf(payload.status, STATUS, 'empfohlen'),
      geschaetzter_mehrumsatz_cents:
        payload.geschaetzter_mehrumsatz_cents != null && payload.geschaetzter_mehrumsatz_cents !== ''
          ? Math.round(Number(payload.geschaetzter_mehrumsatz_cents)) || null
          : null,
      sortierung: Number.isFinite(Number(payload.sortierung)) ? Number(payload.sortierung) : 0,
      updated_at: new Date().toISOString(),
    };

    const id = text(payload.id);
    const query = id
      ? supabaseService.from('park_equipment_items').update(row).eq('id', id)
      : supabaseService.from('park_equipment_items').insert(row);

    const { data, error } = await query
      .select('id, park_id, kategorie, titel, beschreibung, status, geschaetzter_mehrumsatz_cents, sortierung')
      .maybeSingle();

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data });
  }

  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json({ error: 'Missing id' }, 400);

    const { error } = await supabaseService.from('park_equipment_items').delete().eq('id', id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
});
