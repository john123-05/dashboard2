import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-park-equipment
 *
 * Liest die vom Staff gepflegte "Konfiguration/Shop"-Liste (park_equipment_items)
 * fuer die Operator-Seite "Konfiguration". Gleiches Auth-Muster wie
 * operator-machine-revenue.
 *
 *   GET ?park_id=... -> { items: [...] }
 */

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  const parkId = (url.searchParams.get('park_id') || '').trim();
  if (!parkId) return json({ error: 'park_id fehlt' }, 400);

  const auth = await requireOperatorForPark(req, parkId);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const { data, error } = await supabaseService
    .from('park_equipment_items')
    .select(
      'id, kategorie, titel, beschreibung, status, geschaetzter_mehrumsatz_cents, mehrwert_text, bestellstatus, preview_url, sortierung, image_url, before_image_url, after_image_url',
    )
    .eq('park_id', auth.parkId)
    .order('sortierung', { ascending: true });

  if (error) return json({ error: error.message }, 400);
  return json({ items: data ?? [] });
});
