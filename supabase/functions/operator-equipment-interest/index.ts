import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-equipment-interest
 *
 * Der "Interesse anmelden"-Button auf der Operator-Seite "Konfiguration":
 * legt keine Bestellung an (es gibt noch kein Checkout/Stripe-Entitlement
 * dafuer), sondern eine Benachrichtigung fuer Staff im selben Feed wie neue
 * Leads/Support-Tickets (staff_notifications), damit jemand sich meldet.
 *
 *   POST { park_id, item_id } -> { ok: true }
 */

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const payload = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parkId = typeof payload?.park_id === 'string' ? payload.park_id.trim() : '';
  const itemId = typeof payload?.item_id === 'string' ? payload.item_id.trim() : '';
  if (!parkId) return json({ error: 'park_id fehlt' }, 400);
  if (!itemId) return json({ error: 'item_id fehlt' }, 400);

  const auth = await requireOperatorForPark(req, parkId);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const [{ data: park }, { data: item }] = await Promise.all([
    supabaseService.from('parks').select('name').eq('id', auth.parkId).maybeSingle(),
    supabaseService
      .from('park_equipment_items')
      .select('titel, geschaetzter_mehrumsatz_cents')
      .eq('id', itemId)
      .eq('park_id', auth.parkId)
      .maybeSingle(),
  ]);

  if (!item) return json({ error: 'Produkt nicht gefunden' }, 404);

  const parkName = park?.name || 'Unbekannter Park';
  const umsatzHinweis =
    item.geschaetzter_mehrumsatz_cents != null
      ? ` (geschätzt +${(item.geschaetzter_mehrumsatz_cents / 100).toLocaleString('de-DE')} €/Monat)`
      : '';

  const { error } = await supabaseService.from('staff_notifications').insert({
    title: `Interesse: ${parkName} – ${item.titel}`,
    body: `Der Betreiber hat über die Konfigurationsseite Interesse an "${item.titel}" angemeldet${umsatzHinweis}.`,
    url: '/staff/kunden-management?tab=equipment',
  });

  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
});
