import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-machine-revenue
 *
 * Umsatz je Automat für die Umsatz-Seite - aus machine_sale_payments über die
 * SQL-Funktion park_machine_revenue(). Pro Automat: Käufe + Betrag für heute /
 * 7 Tage / Monat / gesamt, plus Karte/Bar-Aufteilung. Automaten ohne Käufe
 * kommen mit Nullen, damit "Automat neu" auch vor dem ersten Verkauf in der
 * Liste steht.
 */

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value) || 0;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  const parkId = text(url.searchParams.get('park_id'));
  if (!parkId) return json({ error: 'park_id fehlt' }, 400);

  const auth = await requireOperatorForPark(req, parkId);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const [{ data: rev, error: revError }, { data: configs }] = await Promise.all([
    supabaseService.rpc('park_machine_revenue', { p_park_id: auth.parkId }),
    supabaseService
      .from('liftpic_machine_configs')
      .select('machine_id, machine_label, is_active')
      .eq('park_id', auth.parkId),
  ]);
  if (revError) return json({ error: revError.message }, 400);

  const revByMachine = new Map<string, Record<string, unknown>>();
  for (const r of (rev ?? []) as Array<Record<string, unknown>>) {
    revByMachine.set(text(r.machine_id), r);
  }

  // Reihenfolge nach machine_id -> "pcneu" (alt) vor "pcneu2" (neu).
  const machines = ((configs ?? []) as Array<Record<string, unknown>>)
    .map((c) => ({ machine_id: text(c.machine_id), machine_label: text(c.machine_label) || text(c.machine_id), is_active: c.is_active === true }))
    .filter((m) => m.machine_id)
    .sort((a, b) => a.machine_id.localeCompare(b.machine_id))
    .map((m) => {
      const r = revByMachine.get(m.machine_id) ?? {};
      return {
        machine_id: m.machine_id,
        machine_label: m.machine_label,
        is_active: m.is_active,
        heute: { anzahl: num(r.heute_anzahl), cent: num(r.heute_cent) },
        woche: { anzahl: num(r.woche_anzahl), cent: num(r.woche_cent) },
        monat: { anzahl: num(r.monat_anzahl), cent: num(r.monat_cent) },
        gesamt: { anzahl: num(r.gesamt_anzahl), cent: num(r.gesamt_cent) },
        karte_anzahl: num(r.karte_anzahl),
        bar_anzahl: num(r.bar_anzahl),
        unbekannt_anzahl: num(r.unbekannt_anzahl),
      };
    });

  return json({ ok: true, data: { machines } });
});
