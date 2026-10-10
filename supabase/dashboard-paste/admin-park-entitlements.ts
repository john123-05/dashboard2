// Eine Datei für den Supabase-Editor (Dashboard → Edge Functions). Inhalt = _shared + index.ts.
// Quelle im Repo: supabase/functions/admin-park-entitlements/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

// For functions deployed directly onto the shared LiftPictures production
// project (kvpcwlcfgmsmarjtwpsx) — admin_users lives right here, so no
// cross-project lookup is needed (contrast with ../staffAuth.ts, which is
// for functions deployed on dashboard2's own project that need to verify
// staff membership against that other project instead).
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

export const supabaseService = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type AdminAuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string };

export async function requireAdminFromRequest(req: Request): Promise<AdminAuthResult> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false, status: 401, message: 'Missing bearer token' };
  }

  const { data: userData, error: userError } = await supabaseService.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false, status: 401, message: 'Invalid auth token' };
  }

  const { data: adminRow, error: adminError } = await supabaseService
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (adminError) {
    return { ok: false, status: 500, message: adminError.message };
  }

  if (!adminRow) {
    return { ok: false, status: 403, message: 'Not an admin user' };
  }

  return { ok: true, userId: userData.user.id };
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}


const PLANS = ['basis', 'marketing_starter', 'marketing_pro'];
const STATUS = ['active', 'trial', 'paused', 'cancelled'];
const FEATURES = [
  'crm_contacts', 'crm_survey', 'crm_social', 'crm_pixel', 'email_marketing',
  'social_campaigns', 'review_routing', 'team_permissions', 'reports_pro', 'online_shop', 'speed',
];
const COLUMNS = 'park_id, plan, features, status, trial_until, source, stripe_subscription_id, updated_at';
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Shared-Projekt, nur admin_users (wie admin-park-equipment).
 * GET ?park_id=… -> gespeicherte Einstellung oder null.
 * POST {park_id, plan, features, status, trial_until} -> vollständige manuelle Einstellung.
 * Stripe-Felder sind für den späteren Billing-Webhook reserviert.
 */
export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const auth = await requireAdminFromRequest(req);
    if (!auth.ok) return json({ error: auth.message }, auth.status);
    if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const raw = req.method === 'POST' ? await req.json().catch(() => null) : null;
    if (req.method === 'POST' && (!raw || typeof raw !== 'object' || Array.isArray(raw))) {
      return json({ error: 'Invalid payload' }, 400);
    }
    const parkId = req.method === 'GET' ? new URL(req.url).searchParams.get('park_id') : raw.park_id;
    if (typeof parkId !== 'string' || !UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);

    if (req.method === 'GET') {
      const { data, error } = await supabaseService.from('park_entitlements')
        .select(COLUMNS).eq('park_id', parkId).maybeSingle();
      return error ? json({ error: 'Entitlements unavailable' }, 503) : json({ data });
    }

    if (!PLANS.includes(raw.plan) || !STATUS.includes(raw.status) ||
        !Array.isArray(raw.features) || raw.features.some((f: unknown) => typeof f !== 'string' || !FEATURES.includes(f)) ||
        (raw.trial_until != null && !validDate(raw.trial_until)) ||
        (raw.status === 'trial' && !validDate(raw.trial_until)) ||
        (raw.source !== undefined && raw.source !== 'manual') || raw.stripe_subscription_id !== undefined) {
      return json({ error: 'Invalid entitlement settings' }, 400);
    }

    const { data: park, error: parkError } = await supabaseService.from('parks')
      .select('id').eq('id', parkId).maybeSingle();
    if (parkError) return json({ error: 'Park lookup failed' }, 503);
    if (!park) return json({ error: 'Park not found' }, 404);

    const { data, error } = await supabaseService.from('park_entitlements').upsert({
      park_id: parkId,
      plan: raw.plan,
      features: [...new Set(raw.features)],
      status: raw.status,
      trial_until: raw.trial_until ?? null,
      source: 'manual',
      // Bestehende Stripe-ID bleibt erhalten, damit späterer Abgleich möglich ist.
      updated_at: new Date().toISOString(),
    }, { onConflict: 'park_id' }).select(COLUMNS).single();
    return error ? json({ error: 'Entitlements could not be saved' }, 503) : json({ ok: true, data });
  } catch {
    return json({ error: 'Entitlements unavailable' }, 503);
  }
}

if (import.meta.main) Deno.serve(handler);
