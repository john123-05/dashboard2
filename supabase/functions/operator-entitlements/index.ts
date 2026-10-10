import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/** Shared-Projekt: GET ?park_id=…; Operator-Token wird samt Park-Zugriff geprüft. */
export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const parkId = new URL(req.url).searchParams.get('park_id') ?? '';
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(parkId)) {
    return json({ error: 'Invalid park_id' }, 400);
  }

  try {
    const auth = await requireOperatorForPark(req, parkId);
    if (!auth.ok) return json({ error: auth.message }, auth.status);

    const { data, error } = await supabaseService.from('park_entitlements')
      .select('park_id, plan, features, status, trial_until')
      .eq('park_id', auth.parkId).maybeSingle();
    // Gestaffelte Einführung: John spielt das SQL separat ein. Ausschließlich
    // die fehlende Tabelle darf wie eine fehlende Zeile behandelt werden.
    if (error?.code === '42P01' || error?.code === 'PGRST205') {
      return json({ data: null, migration_pending: true });
    }
    if (error) return json({ error: 'Entitlements unavailable' }, 503);
    return json({ data });
  } catch {
    return json({ error: 'Entitlements unavailable' }, 503);
  }
}

if (import.meta.main) Deno.serve(handler);
