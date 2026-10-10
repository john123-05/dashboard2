import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOwnerForPark } from '../_shared/operatorAuth.ts';
import { safeReturnUrl, stripeCall } from '../_shared/stripeApi.ts';

/** billing-portal (S1) – nur Inhaber: Link ins Stripe-Kundenportal (Zahlungsart, Rechnungen, Kündigen, Pausieren). */
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const parkId = typeof body?.park_id === 'string' ? body.park_id : '';
    if (!UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);
    const auth = await requireOwnerForPark(req, parkId);
    if (!auth.ok) return json({ error: auth.message }, auth.status);
    const origin = safeReturnUrl(body?.origin);
    if (!origin) return json({ error: 'Invalid origin' }, 400);
    const { data: billing } = await supabaseService.from('park_billing').select('stripe_customer_id').eq('park_id', auth.parkId).maybeSingle();
    if (!billing?.stripe_customer_id) return json({ error: 'Für diesen Park gibt es noch kein Abo.' }, 404);
    const session = await stripeCall<{ url: string }>('billing_portal/sessions', { customer: billing.stripe_customer_id, return_url: `${origin}/plaene` });
    return session.ok ? json({ ok: true, data: { url: session.data.url } }) : json({ error: session.message }, 502);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Billing unavailable' }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
