// Willkommens-Link für neue Kunden: GET /welcome-link?t=<token>
// Prüft den Token (Tabelle welcome_links, nur Hash gespeichert, Ablaufdatum) und erzeugt dann frisch einen
// Supabase-„Passwort festlegen“-Link (admin generate_link, type recovery – es wird KEINE Mail verschickt).
// Antwort: Weiterleitung dorthin; Supabase meldet den Kunden an und schickt ihn auf /set-password.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DASHBOARD = 'https://www.dashboard-liftpictures.com';

async function sha256(v: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const admin = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
const toDashboard = (reason: string) => Response.redirect(`${DASHBOARD}/set-password?link=${reason}`, 302);

Deno.serve(async (req) => {
  try {
    const token = new URL(req.url).searchParams.get('t') ?? '';
    if (!/^[A-Za-z0-9_-]{32,80}$/.test(token)) return toDashboard('invalid');
    const rows = await (await admin(`/rest/v1/welcome_links?token_hash=eq.${await sha256(token)}&select=id,user_id,expires_at,clicks`)).json();
    const link = Array.isArray(rows) ? rows[0] : null;
    if (!link || Date.parse(link.expires_at) < Date.now()) return toDashboard('expired');

    const user = await (await admin(`/auth/v1/admin/users/${link.user_id}`)).json();
    if (!user?.email) return toDashboard('invalid');
    const gen = await admin('/auth/v1/admin/generate_link', {
      method: 'POST',
      body: JSON.stringify({ type: 'recovery', email: user.email, redirect_to: `${DASHBOARD}/set-password` }),
    });
    const g = await gen.json();
    const action = g?.action_link ?? g?.properties?.action_link;
    if (!gen.ok || typeof action !== 'string') return toDashboard('error');

    await admin(`/rest/v1/welcome_links?id=eq.${link.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ clicks: (link.clicks ?? 0) + 1, last_clicked_at: new Date().toISOString() }),
    });
    return Response.redirect(action, 302);
  } catch {
    return toDashboard('error');
  }
});
