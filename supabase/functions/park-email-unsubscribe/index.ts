import { supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { hmacHex } from '../_shared/emailCommon.ts';

/**
 * park-email-unsubscribe (öffentlich, verify_jwt = false) – Ziel des „Abmelden“-Links im Fuß jeder Mail:
 * `…?c=<claim_id>&t=<HMAC-SHA256(claim_id)>`. Ein Klick genügt (UWG). Setzt die Einwilligung für alle
 * Einträge dieser Adresse im Park zurück und trägt die Adresse in die gemeinsame Abmeldeliste ein.
 * Die Supabase-Plattform liefert auf der Standard-Domain nur Klartext, deshalb eine Klartext-Bestätigung.
 */

function page(ok: boolean): Response {
  const body = ok
    ? 'Du hast dich erfolgreich abgemeldet.\n\nDu erhältst ab sofort keine E-Mails mehr von diesem Park.'
    : 'Dieser Abmelde-Link ist nicht gültig oder bereits benutzt worden.\n\nWenn du weiter E-Mails bekommst, antworte bitte auf die Mail.';
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const claimId = url.searchParams.get('c') ?? '';
  const sig = url.searchParams.get('t') ?? '';
  const secret = Deno.env.get('EMAIL_LINK_SECRET') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(claimId) || !sig || !secret) return page(false);
  try {
    if ((await hmacHex(secret, claimId)) !== sig) return page(false);
    const { data: claim } = await supabaseService.from('photo_claims').select('park_id, email').eq('id', claimId).maybeSingle();
    if (!claim?.email) return page(false);
    const email = String(claim.email).trim().toLowerCase();
    await supabaseService.from('photo_claims').update({ marketing_opt_in: false }).eq('park_id', claim.park_id).ilike('email', email);
    await supabaseService.from('crm_marketing_opt_outs').upsert({ email, opted_out_at: new Date().toISOString() }, { onConflict: 'email' });
    return page(true);
  } catch {
    return page(false);
  }
});
