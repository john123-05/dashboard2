// Kleine Stripe-Hilfe (docs/PRODUKT_PLAN.md, S1): REST-Aufrufe ohne SDK, Webhook-Signatur selbst prüfen.

type Params = Record<string, string | number | boolean | undefined | null>;

export function stripeKey(): string {
  return Deno.env.get('STRIPE_SECRET_KEY') ?? '';
}

export async function stripeCall<T = Record<string, unknown>>(
  path: string,
  params: Params = {},
  method: 'GET' | 'POST' = 'POST',
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const key = stripeKey();
  if (!key) return { ok: false, status: 503, message: 'Stripe ist nicht eingerichtet.' };
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') body.append(k, String(v));
  }
  const url = `https://api.stripe.com/v1/${path}${method === 'GET' && body.size > 0 ? `?${body}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: method === 'POST' ? body : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, message: String(json?.error?.message ?? `Stripe ${res.status}`) };
  return { ok: true, data: json as T };
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Prüft die `Stripe-Signature` (t=…,v1=…) gegen den Webhook-Schlüssel; Toleranz 5 Minuten. */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = await hmacHex(secret, `${parts.t}.${rawBody}`);
  const candidates = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  return candidates.some((c) => c.length === expected.length && c === expected);
}

export const PLAN_PRICE_ENV: Record<string, string> = {
  marketing_starter: 'STRIPE_PRICE_STARTER_MONTH',
  marketing_pro: 'STRIPE_PRICE_PRO_MONTH',
};

export function priceFor(plan: string): string {
  const env = PLAN_PRICE_ENV[plan];
  return env ? Deno.env.get(env) ?? '' : '';
}

export function planForPrice(priceId: string): string | null {
  for (const [plan, env] of Object.entries(PLAN_PRICE_ENV)) {
    if (priceId && Deno.env.get(env) === priceId) return plan;
  }
  return null;
}

export function safeReturnUrl(origin: unknown): string | null {
  if (typeof origin !== 'string') return null;
  try {
    const url = new URL(origin);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
    return url.origin;
  } catch {
    return null;
  }
}
