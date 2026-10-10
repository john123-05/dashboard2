import { supabaseService } from './sameProjectAdminAuth.ts';

// Gemeinsame Teile des Park-E-Mail-Versands (docs/PRODUKT_PLAN.md, F1).
// Versand über Make: ein Aufruf je Block von bis zu 100 Empfängern (Muster: Liftpictures-CRM).

export const BLOCK_SIZE = 100;

/** Mails pro Monat je Plan (Vorschlag, mit dem Make-Tarif abgleichen) – gespiegelt in src/lib/plans.ts. */
export const EMAIL_QUOTA: Record<string, number> = { basis: 0, marketing_starter: 2000, marketing_pro: 10000 };

export type Segment = { countries?: string[]; since?: string };
export type Audience = { claimId: string; email: string; name: string };

export function monthStart(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Plan und Monatskontingent. Ohne Zeile gilt die Übergangsregel (Starter), nie ein Aussperren. */
export async function quotaFor(parkId: string): Promise<{ plan: string; quota: number }> {
  const { data } = await supabaseService.from('park_entitlements')
    .select('plan, status, trial_until, email_extra_quota').eq('park_id', parkId).maybeSingle();
  let plan = 'marketing_starter';
  if (data) {
    const active = data.status === 'active' || (data.status === 'trial' && (!data.trial_until || Date.parse(data.trial_until) + 86_400_000 > Date.now()));
    plan = active ? String(data.plan) : 'basis';
  }
  return { plan, quota: (EMAIL_QUOTA[plan] ?? 0) + (EMAIL_QUOTA[plan] ? Number(data?.email_extra_quota ?? 0) : 0) };
}

export async function usageThisMonth(parkId: string): Promise<number> {
  const { data } = await supabaseService.from('park_email_usage').select('sent').eq('park_id', parkId).eq('month', monthStart()).maybeSingle();
  return Number(data?.sent ?? 0);
}

/**
 * Empfänger: nur Gäste mit Einwilligung (`marketing_opt_in`), je Adresse einmal (neuester Eintrag),
 * ohne Adressen auf der gemeinsamen Abmeldeliste `crm_marketing_opt_outs`.
 */
export async function resolveAudience(parkId: string, language: string | null, segment: Segment): Promise<Audience[]> {
  let query = supabaseService.from('photo_claims')
    .select('id, email, full_name, locale, country_code, created_at')
    .eq('park_id', parkId).eq('marketing_opt_in', true).eq('status', 'claimed').not('email', 'is', null)
    .order('created_at', { ascending: false }).limit(20000);
  if (language) query = query.eq('locale', language);
  if (segment.since) query = query.gte('created_at', segment.since);
  if (Array.isArray(segment.countries) && segment.countries.length > 0) {
    query = query.in('country_code', segment.countries.map((c) => c.toUpperCase()));
  }
  const { data } = await query;
  const seen = new Map<string, Audience>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const email = String(row.email ?? '').trim().toLowerCase();
    if (!email.includes('@') || seen.has(email)) continue;
    seen.set(email, { claimId: String(row.id), email, name: String(row.full_name ?? '') });
  }
  const emails = [...seen.keys()];
  for (let i = 0; i < emails.length; i += 500) {
    const { data: out } = await supabaseService.from('crm_marketing_opt_outs').select('email').in('email', emails.slice(i, i + 500));
    for (const row of (out ?? []) as Array<{ email: string }>) seen.delete(String(row.email).toLowerCase());
  }
  return [...seen.values()];
}

/** Fertige Mail je Empfänger: Platzhalter ersetzen, Öffnungspixel und Pflicht-Fuß anhängen. */
export async function renderMail(opts: {
  html: string;
  preheader: string;
  parkName: string;
  footerAddress: string;
  senderName: string;
  name: string;
  claimId: string;
  sendId: string;
  functionsBase: string;
  secret: string;
}): Promise<string> {
  const firstName = escapeHtml(opts.name.trim().split(/\s+/)[0] || '');
  const sig = await hmacHex(opts.secret, opts.claimId);
  const unsubscribeUrl = `${opts.functionsBase}/park-email-unsubscribe?c=${opts.claimId}&t=${sig}`;
  const pixelUrl = `${opts.functionsBase}/park-email-open?s=${opts.sendId}`;
  let html = opts.html
    .replaceAll('{{name}}', firstName)
    .replaceAll('{{park}}', escapeHtml(opts.parkName))
    .replaceAll('{{unsubscribe_url}}', unsubscribeUrl)
    .replaceAll('{{open_pixel}}', '');
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>`
    : '';
  const footer = `
<table role="presentation" width="100%" style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#888888;">
  <tr><td style="text-align:center;">
    ${escapeHtml(opts.senderName)}<br/>${escapeHtml(opts.footerAddress).replace(/\n/g, '<br/>')}<br/>
    <a href="${unsubscribeUrl}" style="color:#888888;">Abmelden</a>
  </td></tr>
</table>
<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;" />`;
  return pre + html + footer;
}

export async function postToMake(webhookUrl: string, payload: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) return { ok: true };
    return { ok: false, error: `Make ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Make nicht erreichbar' };
  }
}

/** Automationen gehören zu Marketing Pro (oder einzeln freigeschaltet über `features`). */
export async function automationsAllowed(parkId: string): Promise<boolean> {
  const { data } = await supabaseService.from('park_entitlements')
    .select('plan, status, trial_until, features').eq('park_id', parkId).maybeSingle();
  if (!data) return false;
  if (Array.isArray(data.features) && data.features.includes('email_automations')) return true;
  const active = data.status === 'active' || (data.status === 'trial' && (!data.trial_until || Date.parse(data.trial_until) + 86_400_000 > Date.now()));
  return active && data.plan === 'marketing_pro';
}
