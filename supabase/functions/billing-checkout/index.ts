import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { fetchOperatorEmail, requireOwnerForPark } from '../_shared/operatorAuth.ts';
import { priceFor, safeReturnUrl, stripeCall } from '../_shared/stripeApi.ts';

/**
 * billing-checkout (docs/PRODUKT_PLAN.md, S1) – nur Inhaber.
 * POST { park_id, plan: 'marketing_starter' | 'marketing_pro', origin } -> { url } (Stripe Checkout, Abo).
 * Solange das Secret BILLING_ENABLED nicht "true" ist (oder ein Preis fehlt), antwortet die Function mit
 * 503 `billing_disabled` – das Dashboard fällt dann auf die normale Anfrage zurück.
 */
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const parkId = typeof body?.park_id === 'string' ? body.park_id : '';
    const plan = typeof body?.plan === 'string' ? body.plan : '';
    if (!UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);
    const auth = await requireOwnerForPark(req, parkId);
    if (!auth.ok) return json({ error: auth.message }, auth.status);

    const price = priceFor(plan);
    if (Deno.env.get('BILLING_ENABLED') !== 'true' || !price) return json({ error: 'billing_disabled' }, 503);
    const origin = safeReturnUrl(body?.origin);
    if (!origin) return json({ error: 'Invalid origin' }, 400);

    // Kunde je Park wiederverwenden.
    const { data: billing } = await supabaseService.from('park_billing').select('stripe_customer_id').eq('park_id', auth.parkId).maybeSingle();
    let customer = billing?.stripe_customer_id as string | undefined;
    if (!customer) {
      const { data: park } = await supabaseService.from('parks').select('name').eq('id', auth.parkId).maybeSingle();
      const created = await stripeCall<{ id: string }>('customers', {
        name: String(park?.name ?? ''),
        email: (await fetchOperatorEmail(req)) ?? undefined,
        'metadata[park_id]': auth.parkId,
      });
      if (!created.ok) return json({ error: created.message }, 502);
      customer = created.data.id;
      await supabaseService.from('park_billing').upsert({ park_id: auth.parkId, stripe_customer_id: customer, updated_at: new Date().toISOString() }, { onConflict: 'park_id' });
    }

    const trialDays = Math.max(0, Math.min(365, Number(Deno.env.get('BILLING_TRIAL_DAYS') ?? 0) || 0));
    const session = await stripeCall<{ url: string }>('checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: auth.parkId,
      'line_items[0][price]': price,
      'line_items[0][quantity]': 1,
      'subscription_data[metadata][park_id]': auth.parkId,
      'subscription_data[metadata][plan]': plan,
      'subscription_data[trial_period_days]': trialDays > 0 ? trialDays : undefined,
      'metadata[park_id]': auth.parkId,
      'metadata[plan]': plan,
      billing_address_collection: 'required',
      'tax_id_collection[enabled]': true,
      'customer_update[name]': 'auto',
      'customer_update[address]': 'auto',
      allow_promotion_codes: true,
      success_url: `${origin}/plaene?billing=success`,
      cancel_url: `${origin}/plaene?billing=cancel`,
    });
    return session.ok ? json({ ok: true, data: { url: session.data.url } }) : json({ error: session.message }, 502);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Billing unavailable' }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
