// Eine Datei für den Supabase-Editor (Dashboard → Edge Functions). Inhalt = _shared + index.ts.
// Quelle im Repo: supabase/functions/operator-social-campaigns/index.ts

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

export const LEAD_TEMPERATURES = ['heiss', 'warm', 'kalt'] as const;
export type LeadTemperature = (typeof LEAD_TEMPERATURES)[number];

export function isValidTemperature(value: unknown): value is LeadTemperature {
  return typeof value === 'string' && (LEAD_TEMPERATURES as readonly string[]).includes(value);
}


const OPERATOR_SUPABASE_URL = Deno.env.get("OPERATOR_SUPABASE_URL") ??
  "https://xcrxltiiovpoladpaewd.supabase.co";
const OPERATOR_SUPABASE_ANON_KEY = Deno.env.get("OPERATOR_SUPABASE_ANON_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcnhsdGlpb3Zwb2xhZHBhZXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MTIxODEsImV4cCI6MjA4MjQ4ODE4MX0.qScZ_Uk6q68KHd35VloDuwb3DnC9iAktMx6xt17YWoQ";

export type OperatorAuthResult =
  | { ok: true; userId: string; parkId: string; organizationId: string | null }
  | { ok: false; status: number; message: string };

type OperatorUser = {
  id: string;
  app_metadata?: Record<string, unknown> | null;
};

function normalizeParkIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function getAllowedParkIds(user: OperatorUser | null): string[] {
  const metadata = user?.app_metadata ?? {};
  return normalizeParkIds(metadata.allowed_park_ids ?? metadata.park_ids);
}

async function fetchOperatorUser(token: string): Promise<OperatorUser | null> {
  const response = await fetch(`${OPERATOR_SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: OPERATOR_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id
    ? { id: String(user.id), app_metadata: user.app_metadata ?? null }
    : null;
}

async function fetchAccessiblePark(
  token: string,
  parkId: string,
): Promise<{ id: string; organization_id: string | null } | null> {
  const response = await fetch(
    `${OPERATOR_SUPABASE_URL}/rest/v1/parks?select=id,organization_id&id=eq.${
      encodeURIComponent(parkId)
    }`,
    {
      headers: {
        apikey: OPERATOR_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.id
    ? {
      id: String(row.id),
      organization_id: row.organization_id ? String(row.organization_id) : null,
    }
    : null;
}

export async function requireOperatorForPark(
  req: Request,
  parkId: string,
): Promise<OperatorAuthResult> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false, status: 401, message: "Missing bearer token" };
  }

  const user = await fetchOperatorUser(token);
  if (!user) {
    // Kein Betreiber-Token: im Staff-CRM kommt das Token des gemeinsamen Projekts.
    // Staff (admin_users) darf jeden Park sehen.
    const staff = await requireAdminFromRequest(req);
    if (staff.ok) {
      const { data: park } = await supabaseService
        .from("parks")
        .select("id, organization_id")
        .eq("id", parkId)
        .maybeSingle();
      if (!park) return { ok: false, status: 404, message: "Park not found" };
      return {
        ok: true,
        userId: staff.userId,
        parkId: String(park.id),
        organizationId: park.organization_id ? String(park.organization_id) : null,
      };
    }
    return { ok: false, status: 401, message: "Invalid operator auth token" };
  }

  const allowedParkIds = getAllowedParkIds(user);
  if (allowedParkIds.length > 0 && !allowedParkIds.includes(parkId)) {
    return { ok: false, status: 403, message: "No access to this park" };
  }

  const park = await fetchAccessiblePark(token, parkId);
  if (!park) {
    return { ok: false, status: 403, message: "No access to this park" };
  }

  return {
    ok: true,
    userId: user.id,
    parkId: park.id,
    organizationId: park.organization_id,
  };
}


/**
 * operator-social-campaigns (docs/PRODUKT_PLAN.md, E1–E3)
 *
 *   GET  ?park_id=…                     -> { campaigns: […mit Zählern], active_id }
 *   GET  ?park_id=…&campaign_id=…       -> { campaign, entries, leaderboard }
 *   POST { park_id, action: 'save', campaign }
 *   POST { park_id, action: 'verify', entry_id, verified }
 *   POST { park_id, action: 'approve', entry_id, approved }   (nur mit photo_rights)
 *   POST { park_id, action: 'draw', campaign_id, redraw?, weighted? }
 *
 * Nur Service Role, E-Mail/Telefon verlassen die Function maskiert.
 */

const TYPES = ['share_unlock', 'giveaway', 'record'];
const STATUSES = ['draft', 'active', 'ended'];
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

function text(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function mask(value: unknown): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return null;
  const at = v.indexOf('@');
  if (at > 0) return `${v[0]}***${v.slice(at)}`;
  return v.length > 4 ? `${v.slice(0, 2)}***${v.slice(-2)}` : '***';
}

function iso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function rules(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [lang, v] of Object.entries(value as Record<string, unknown>)) {
      const t = text(v, 4000);
      if (t && /^[a-z]{2}$/.test(lang)) out[lang] = t;
    }
  }
  return out;
}

function missingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

async function listCampaigns(parkId: string) {
  const { data, error } = await supabaseService
    .from('park_social_campaigns').select('*').eq('park_id', parkId)
    .order('created_at', { ascending: false }).limit(100);
  if (missingTable(error)) return { campaigns: [], active_id: null, migration_pending: true };
  if (error) throw new Error(error.message);
  const campaigns = (data ?? []) as Row[];
  const ids = campaigns.map((c) => String(c.id));
  const counts = new Map<string, { total: number; verified: number }>();
  if (ids.length > 0) {
    const { data: entries } = await supabaseService
      .from('park_social_entries').select('campaign_id, verified_at').in('campaign_id', ids).limit(20000);
    for (const e of (entries ?? []) as Row[]) {
      const key = String(e.campaign_id);
      const c = counts.get(key) ?? { total: 0, verified: 0 };
      c.total += 1;
      if (e.verified_at) c.verified += 1;
      counts.set(key, c);
    }
  }
  return {
    campaigns: campaigns.map((c) => ({
      ...c,
      entries_total: counts.get(String(c.id))?.total ?? 0,
      entries_verified: counts.get(String(c.id))?.verified ?? 0,
    })),
    active_id: (campaigns.find((c) => c.status === 'active')?.id as string | undefined) ?? null,
  };
}

async function visitorsByEntry(campaignId: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data: links, error } = await supabaseService
    .from('park_share_links').select('claim_id, unique_visitors').eq('campaign_id', campaignId).limit(5000);
  if (error || !links?.length) return out;
  const { data: claims } = await supabaseService
    .from('photo_claims').select('id, social_entry_id')
    .in('id', (links as Row[]).map((l) => String(l.claim_id))).limit(5000);
  const entryOfClaim = new Map((claims ?? []).map((c: Row) => [String(c.id), c.social_entry_id ? String(c.social_entry_id) : null]));
  for (const l of links as Row[]) {
    const entryId = entryOfClaim.get(String(l.claim_id));
    if (entryId) out.set(entryId, (out.get(entryId) ?? 0) + Number(l.unique_visitors ?? 0));
  }
  return out;
}

async function loadCampaign(parkId: string, campaignId: string) {
  const { data: campaign } = await supabaseService
    .from('park_social_campaigns').select('*').eq('id', campaignId).eq('park_id', parkId).maybeSingle();
  if (!campaign) return null;
  const { data } = await supabaseService
    .from('park_social_entries')
    .select('id, name, email, phone, handle, platform, post_url, giveaway_opt_in, verified_at, photo_rights, approved_at, photo_id, created_at')
    .eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(500);
  const visitors = await visitorsByEntry(campaignId);
  const entries = ((data ?? []) as Row[]).map((e) => ({
    id: e.id, name: e.name, handle: e.handle, platform: e.platform, post_url: e.post_url,
    giveaway_opt_in: e.giveaway_opt_in, verified_at: e.verified_at, photo_rights: e.photo_rights,
    approved_at: e.approved_at, photo_id: e.photo_id, created_at: e.created_at,
    email_masked: mask(e.email), phone_masked: mask(e.phone),
    visitors: visitors.get(String(e.id)) ?? 0,
  }));
  const leaderboard = [...entries].filter((e) => e.visitors > 0).sort((a, b) => b.visitors - a.visitors).slice(0, 20);
  return { campaign, entries, leaderboard };
}

async function saveCampaign(parkId: string, raw: unknown) {
  const input = (raw ?? {}) as Row;
  const name = text(input.name, 120);
  if (!name) return { error: 'Bitte einen Namen eingeben.' };
  const type = text(input.type);
  if (!TYPES.includes(type)) return { error: 'Unbekannter Kampagnentyp.' };
  const status = text(input.status) || 'draft';
  if (!STATUSES.includes(status)) return { error: 'Unbekannter Status.' };
  const startsAt = iso(input.starts_at);
  const endsAt = iso(input.ends_at);
  if (startsAt && endsAt && endsAt <= startsAt) return { error: 'Das Ende muss nach dem Start liegen.' };
  const row = {
    park_id: parkId,
    name,
    type,
    status,
    hashtag: text(input.hashtag, 80) || null,
    mention: text(input.mention, 80) || null,
    prize: text(input.prize, 200) || null,
    rules_text: rules(input.rules_text),
    starts_at: startsAt,
    ends_at: endsAt,
    updated_at: new Date().toISOString(),
  };
  const id = text(input.id, 40);
  if (id && !UUID.test(id)) return { error: 'Ungültige Kampagne.' };

  if (status === 'active') {
    // Nur eine aktive Kampagne je Park: die bisherige wird beendet.
    let q = supabaseService.from('park_social_campaigns').update({ status: 'ended', updated_at: row.updated_at })
      .eq('park_id', parkId).eq('status', 'active');
    if (id) q = q.neq('id', id);
    const { error } = await q;
    if (error) return { error: error.message };
  }
  const { error } = id
    ? await supabaseService.from('park_social_campaigns').update(row).eq('id', id).eq('park_id', parkId)
    : await supabaseService.from('park_social_campaigns').insert(row);
  return error ? { error: error.message } : { ok: true };
}

function pickWeighted(pool: { id: string; weight: number }[]): string {
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  let roll = buf[0] % total;
  for (const p of pool) {
    if (roll < p.weight) return p.id;
    roll -= p.weight;
  }
  return pool[pool.length - 1].id;
}

async function draw(parkId: string, campaignId: string, redraw: boolean, weighted: boolean) {
  const { data: campaign } = await supabaseService
    .from('park_social_campaigns').select('id, winner_entry_id').eq('id', campaignId).eq('park_id', parkId).maybeSingle();
  if (!campaign) return { error: 'Kampagne nicht gefunden.' };
  if (campaign.winner_entry_id && !redraw) return { ok: true, winner_entry_id: campaign.winner_entry_id };
  const { data } = await supabaseService
    .from('park_social_entries').select('id')
    .eq('campaign_id', campaignId).eq('giveaway_opt_in', true).not('verified_at', 'is', null).limit(5000);
  const entries = (data ?? []) as Row[];
  if (entries.length === 0) return { error: 'Keine geprüften Teilnehmer mit Teilnahme am Gewinnspiel.' };
  const visitors = weighted ? await visitorsByEntry(campaignId) : new Map<string, number>();
  const pool = entries.map((e) => ({ id: String(e.id), weight: 1 + Math.min(9, visitors.get(String(e.id)) ?? 0) }));
  const winner = pickWeighted(pool);
  const { error } = await supabaseService.from('park_social_campaigns')
    .update({ winner_entry_id: winner, drawn_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', campaignId);
  return error ? { error: error.message } : { ok: true, winner_entry_id: winner };
}

export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const parkId = text(url.searchParams.get('park_id'), 40);
      if (!UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);
      const auth = await requireOperatorForPark(req, parkId);
      if (!auth.ok) return json({ error: auth.message }, auth.status);
      const campaignId = text(url.searchParams.get('campaign_id'), 40);
      if (campaignId) {
        if (!UUID.test(campaignId)) return json({ error: 'Invalid campaign_id' }, 400);
        const detail = await loadCampaign(auth.parkId, campaignId);
        return detail ? json({ ok: true, data: detail }) : json({ error: 'Kampagne nicht gefunden.' }, 404);
      }
      return json({ ok: true, data: await listCampaigns(auth.parkId) });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null) as Row | null;
      const parkId = text(body?.park_id, 40);
      if (!body || !UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);
      const auth = await requireOperatorForPark(req, parkId);
      if (!auth.ok) return json({ error: auth.message }, auth.status);
      const action = text(body.action, 20);

      if (action === 'save') {
        const result = await saveCampaign(auth.parkId, body.campaign);
        return 'error' in result ? json({ error: result.error }, 400) : json({ ok: true, data: await listCampaigns(auth.parkId) });
      }
      if (action === 'verify' || action === 'approve') {
        const entryId = text(body.entry_id, 40);
        if (!UUID.test(entryId)) return json({ error: 'Invalid entry_id' }, 400);
        const { data: entry } = await supabaseService.from('park_social_entries')
          .select('id, photo_rights').eq('id', entryId).eq('park_id', auth.parkId).maybeSingle();
        if (!entry) return json({ error: 'Eintrag nicht gefunden.' }, 404);
        if (action === 'verify') {
          const on = body.verified === true;
          const { error } = await supabaseService.from('park_social_entries')
            .update({ verified_at: on ? new Date().toISOString() : null, verified_by: on ? 'manual' : null }).eq('id', entryId);
          return error ? json({ error: error.message }, 400) : json({ ok: true });
        }
        const on = body.approved === true;
        if (on && !entry.photo_rights) return json({ error: 'Der Gast hat der Veröffentlichung nicht zugestimmt.' }, 400);
        const { error } = await supabaseService.from('park_social_entries')
          .update({ approved_at: on ? new Date().toISOString() : null }).eq('id', entryId);
        return error ? json({ error: error.message }, 400) : json({ ok: true });
      }
      if (action === 'draw') {
        const campaignId = text(body.campaign_id, 40);
        if (!UUID.test(campaignId)) return json({ error: 'Invalid campaign_id' }, 400);
        const result = await draw(auth.parkId, campaignId, body.redraw === true, body.weighted === true);
        return 'error' in result ? json({ error: result.error }, 400) : json({ ok: true, data: result });
      }
      return json({ error: 'Unknown action' }, 400);
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Campaigns unavailable' }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
