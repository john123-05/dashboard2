import { supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { buildGermanWebsiteRequestImportKey } from '../_shared/germanWebsiteRequestImport.ts';

/**
 * demo-request – öffentlich (ohne Anmeldung): „Demo buchen“ auf der Login-Seite von Liftbase.
 *   POST { name, email, company, phone?, website? }  -> { ok: true }
 * Legt eine Anfrage in `german_website_requests` an (erscheint im CRM unter den Anfragen, löst die gewohnte
 * Benachrichtigung an Staff aus). Danach wählt der Interessent seinen Termin bei Calendly.
 *
 * Schutz gegen Missbrauch (die Adresse ist öffentlich):
 * - `website` ist ein unsichtbares Feld; füllt es jemand aus, ist es ein Bot -> so tun, als wäre alles gut.
 * - Dieselbe E-Mail zählt je Tag nur einmal (import_key mit Tagesdatum).
 * - Höchstens 40 Demo-Anfragen pro Stunde insgesamt.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const SOURCE = 'Liftbase Login-Seite';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return json({ error: 'Invalid body' }, 400);
    if (text(body.website, 200)) return json({ ok: true });

    const name = text(body.name, 120);
    const email = text(body.email, 200).toLowerCase();
    const company = text(body.company, 160);
    const phone = text(body.phone, 60);
    if (!name || !EMAIL.test(email)) return json({ error: 'Name und gültige E-Mail-Adresse sind nötig.' }, 400);

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseService.from('german_website_requests')
      .select('id', { count: 'exact', head: true }).eq('referral_source', SOURCE).gte('created_at', since);
    if ((count ?? 0) >= 40) return json({ error: 'Gerade sind zu viele Anfragen eingegangen. Bitte in einer Stunde noch einmal versuchen.' }, 429);

    const day = new Date().toISOString().slice(0, 10);
    const { error } = await supabaseService.from('german_website_requests').upsert([{
      name, company, email, phone,
      attraction_type: '',
      interest: 'Liftbase-Demo (Videokonferenz)',
      referral_source: SOURCE,
      source: 'Liftbase (Demo buchen)',
      comment: 'Über „Demo buchen“ auf der Login-Seite. Termin wählt der Interessent selbst bei Calendly.',
      submitted_at: new Date().toISOString(),
      import_key: buildGermanWebsiteRequestImportKey({ email, timestamp: `demo-${day}`, name: '', company: '' }),
    }], { onConflict: 'import_key' });
    if (error) return json({ error: 'Die Anfrage konnte nicht gespeichert werden.' }, 503);
    return json({ ok: true });
  } catch {
    return json({ error: 'Die Anfrage konnte nicht gespeichert werden.' }, 500);
  }
});
