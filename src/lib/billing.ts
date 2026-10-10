import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';

// Abrechnung über Stripe (docs/PRODUKT_PLAN.md, S1). Solange das Secret BILLING_ENABLED nicht "true" ist,
// antwortet der Server mit `billing_disabled` und die Seite nutzt weiter die normale Anfrage.

export class BillingDisabledError extends Error {
  constructor() {
    super('billing_disabled');
  }
}

async function call(fn: string, payload: Record<string, unknown>): Promise<string> {
  const {
    data: { session },
  } = await getFunctionSession();
  if (!session?.access_token) throw new Error('Sitzung abgelaufen. Bitte neu anmelden.');
  const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: EXTERNAL_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...payload, origin: window.location.origin }),
  });
  const body = await res.json().catch(() => null);
  if (res.status === 503 && body?.error === 'billing_disabled') throw new BillingDisabledError();
  if (!res.ok || !body?.data?.url) throw new Error(body?.error || `HTTP ${res.status}`);
  return String(body.data.url);
}

export const startCheckout = (parkId: string, plan: 'marketing_starter' | 'marketing_pro') =>
  call('billing-checkout', { park_id: parkId, plan });

export const openBillingPortal = (parkId: string) => call('billing-portal', { park_id: parkId });
