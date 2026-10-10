import { json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { planForPrice, stripeCall, verifyStripeSignature } from '../_shared/stripeApi.ts';

/**
 * billing-webhook (S1, öffentlich, verify_jwt = false) – Stripe meldet Abo-Änderungen.
 * Schreibt `park_entitlements` mit source = 'stripe'. Signatur wird mit STRIPE_BILLING_WEBHOOK_SECRET geprüft.
 * Ereignisse: checkout.session.completed, customer.subscription.created|updated|deleted, invoice.payment_failed.
 */
type Row = Record<string, any>; // deno-lint-ignore no-explicit-any

function mapStatus(status: string): 'active' | 'trial' | 'paused' | 'cancelled' {
  if (status === 'trialing') return 'trial';
  if (status === 'paused') return 'paused';
  if (status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired') return 'cancelled';
  return 'active'; // active, past_due (Stripe versucht es weiter), incomplete
}

async function applySubscription(sub: Row): Promise<void> {
  const parkId = String(sub.metadata?.park_id ?? '');
  if (!parkId) return;
  const priceId = String(sub.items?.data?.[0]?.price?.id ?? '');
  const plan = planForPrice(priceId) ?? String(sub.metadata?.plan ?? '');
  if (plan !== 'marketing_starter' && plan !== 'marketing_pro') return;
  const status = mapStatus(String(sub.status));
  const trialEnd = status === 'trial' && sub.trial_end ? new Date(Number(sub.trial_end) * 1000).toISOString().slice(0, 10) : null;
  const { data: current } = await supabaseService.from('park_entitlements').select('features, email_extra_quota, notiz').eq('park_id', parkId).maybeSingle();
  await supabaseService.from('park_entitlements').upsert({
    park_id: parkId,
    plan,
    status,
    trial_until: trialEnd,
    features: current?.features ?? [],
    email_extra_quota: current?.email_extra_quota ?? 0,
    notiz: current?.notiz ?? null,
    source: 'stripe',
    stripe_subscription_id: String(sub.id),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'park_id' });
  if (sub.customer) {
    await supabaseService.from('park_billing').upsert({ park_id: parkId, stripe_customer_id: String(sub.customer), updated_at: new Date().toISOString() }, { onConflict: 'park_id' });
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const raw = await req.text();
  const secret = Deno.env.get('STRIPE_BILLING_WEBHOOK_SECRET') ?? '';
  if (!(await verifyStripeSignature(raw, req.headers.get('stripe-signature'), secret))) return json({ error: 'invalid signature' }, 400);
  try {
    const event = JSON.parse(raw) as Row;
    const object = event.data?.object as Row;
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySubscription(event.type === 'customer.subscription.deleted' ? { ...object, status: 'canceled' } : object);
        break;
      case 'checkout.session.completed': {
        if (object.mode === 'subscription' && object.subscription) {
          const sub = await stripeCall<Row>(`subscriptions/${object.subscription}`, {}, 'GET');
          if (sub.ok) {
            // Metadaten der Sitzung als Rückfall, falls das Abo sie nicht trägt.
            sub.data.metadata = { ...(object.metadata ?? {}), ...(sub.data.metadata ?? {}) };
            await applySubscription(sub.data);
          }
        }
        break;
      }
      default:
        break; // andere Ereignisse ignorieren (invoice.payment_failed: Stripe meldet den Status über subscription.updated)
    }
    return json({ received: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'webhook failed' }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
