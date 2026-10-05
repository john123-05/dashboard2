import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-equipment-interest
 *
 * Der "Jetzt anfragen"-Button auf der Operator-Seite "Konfiguration" (bei
 * Empfehlungen UND beim Fotopapier-Nachbestellen - absichtlich derselbe
 * Mechanismus fuer beides, damit es sich fuer den Betreiber gleich anfuehlt).
 * Legt keine Bestellung an (es gibt noch kein Checkout/Stripe-Entitlement
 * dafuer), sondern eine Benachrichtigung fuer Staff im selben Feed wie neue
 * Leads/Support-Tickets (staff_notifications), damit jemand sich meldet.
 *
 *   POST { park_id, item_id }        -> Anfrage zu einer Ausstattungs-Empfehlung
 *   POST { park_id, label }          -> freie Anfrage ohne Ausstattungs-Eintrag
 *                                        (z. B. "Fotopapier nachbestellen")
 */

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const payload = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parkId = typeof payload?.park_id === 'string' ? payload.park_id.trim() : '';
  const itemId = typeof payload?.item_id === 'string' ? payload.item_id.trim() : '';
  const label = typeof payload?.label === 'string' ? payload.label.trim() : '';
  if (!parkId) return json({ error: 'park_id fehlt' }, 400);
  if (!itemId && !label) return json({ error: 'item_id oder label fehlt' }, 400);

  const auth = await requireOperatorForPark(req, parkId);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const { data: park } = await supabaseService.from('parks').select('name').eq('id', auth.parkId).maybeSingle();
  const parkName = park?.name || 'Unbekannter Park';

  let betreff = label;
  let umsatzHinweis = '';

  if (itemId) {
    const { data: item } = await supabaseService
      .from('park_equipment_items')
      .select('titel, geschaetzter_mehrumsatz_cents')
      .eq('id', itemId)
      .eq('park_id', auth.parkId)
      .maybeSingle();
    if (!item) return json({ error: 'Produkt nicht gefunden' }, 404);
    betreff = item.titel;
    umsatzHinweis =
      item.geschaetzter_mehrumsatz_cents != null
        ? ` (geschätzt +${(item.geschaetzter_mehrumsatz_cents / 100).toLocaleString('de-DE')} €/Monat)`
        : '';
  }

  const { error } = await supabaseService.from('staff_notifications').insert({
    title: `Anfrage: ${parkName} – ${betreff}`,
    body: `Der Betreiber hat über die Konfigurationsseite "${betreff}" angefragt${umsatzHinweis}.`,
    url: '/kundenmanagement',
  });

  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
});
