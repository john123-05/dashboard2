import { supabaseService } from '../_shared/sameProjectAdminAuth.ts';

/**
 * park-email-open (öffentlich, verify_jwt = false) – 1×1-Zählpixel in jeder Park-Mail:
 * `…?s=<send_id>` setzt die erste Öffnung (`opened_at`) und erhöht `opened` der Kampagne einmalig.
 * Liefert IMMER ein Bild zurück. Klicks werden in der ersten Fassung nicht gezählt.
 */

const PIXEL = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7'), (c) => c.charCodeAt(0));
const HEADERS = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Access-Control-Allow-Origin': '*',
};

Deno.serve(async (req) => {
  try {
    const sendId = new URL(req.url).searchParams.get('s') ?? '';
    if (/^[0-9a-f-]{36}$/i.test(sendId)) {
      const { data: send } = await supabaseService.from('park_email_sends').select('campaign_id, opened_at').eq('id', sendId).maybeSingle();
      if (send && !send.opened_at) {
        await supabaseService.from('park_email_sends').update({ opened_at: new Date().toISOString() }).eq('id', sendId).is('opened_at', null);
        const { data: campaign } = await supabaseService.from('park_email_campaigns').select('opened').eq('id', send.campaign_id).maybeSingle();
        await supabaseService.from('park_email_campaigns').update({ opened: Number(campaign?.opened ?? 0) + 1 }).eq('id', send.campaign_id);
      }
    }
  } catch {
    // Zählen darf die Anzeige der Mail nie stören.
  }
  return new Response(PIXEL, { status: 200, headers: HEADERS });
});
