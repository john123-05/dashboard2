import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-kiosk-purchases
 *
 * Einzelkäufe am Automaten für die Käufe-Seite - aus machine_sale_payments,
 * NICHT aus der photos-Tabelle. Der Unterschied: machine_sale_payments ist
 * dauerhaft (zurück bis 2025), photos-Zeilen werden nach ~30 Tagen gelöscht.
 * So kann die Käufe-Seite Monate zurückblättern, mit Zahlungsart + Kartenmarke
 * direkt in der Zeile.
 *
 * photos + photo_claims werden nur noch dazugejoint, um "wer hat's abgeholt /
 * E-Mail" zu zeigen - das gibt es naturgemäß nur für die jüngeren Käufe.
 * Zuordnung über die hinteren 4 Stellen der Bildnummer, weil
 * photos.source_file_code gekürzt gespeichert wird ("56820" -> "6820").
 */

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function chunkedIn<T>(
  values: string[],
  size: number,
  run: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(...(await run(values.slice(i, i + size))));
  }
  return out;
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

  const now = new Date();
  const toParam = text(url.searchParams.get('to'));
  const fromParam = text(url.searchParams.get('from'));
  const to = toParam ? new Date(toParam) : now;
  const from = fromParam ? new Date(fromParam) : new Date(now.getTime() - 30 * 86_400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return json({ error: 'from/to ungültig' }, 400);
  }
  const LIMIT = Math.min(Number(url.searchParams.get('limit')) || 5000, 10_000);

  const { data: park } = await supabaseService
    .from('parks')
    .select('price_per_photo_cents')
    .eq('id', auth.parkId)
    .maybeSingle();
  const priceCents = (park?.price_per_photo_cents as number | null) ?? null;

  const { data: rows, error } = await supabaseService
    .from('machine_sale_payments')
    .select('sold_at, sold_local, bild_nr, print_count, method, method_source, amount_cents, card_scheme, receipt_no, auth_code')
    .eq('park_id', auth.parkId)
    .gte('sold_at', from.toISOString())
    .lte('sold_at', to.toISOString())
    .order('sold_at', { ascending: false })
    .limit(LIMIT + 1);
  if (error) return json({ error: error.message }, 400);

  const truncated = (rows?.length ?? 0) > LIMIT;
  const sales = (rows ?? []).slice(0, LIMIT) as Array<Record<string, unknown>>;

  // Bildnummern + ihre 4-stellige Kurzform sammeln.
  const codes = new Set<string>();
  for (const s of sales) {
    const b = text(s.bild_nr);
    if (/^\d+$/.test(b)) {
      codes.add(b);
      codes.add(String(Number(b) % 10000));
    }
  }

  type Info = { email: string | null; name: string | null; capturedAt: string | null };
  const infoByCode = new Map<string, Info>();

  if (codes.size > 0) {
    const photos = await chunkedIn(
      [...codes],
      250,
      async (chunk) => {
        const { data } = await supabaseService
          .from('photos')
          .select('id, source_file_code, captured_at, created_at')
          .eq('park_id', auth.parkId)
          .eq('is_test', false)
          .in('source_file_code', chunk);
        return (data ?? []) as Array<Record<string, unknown>>;
      },
    );

    const photoIds = photos.map((p) => text(p.id)).filter(Boolean);
    const claimByPhoto = new Map<string, { email: string | null; full_name: string | null }>();
    if (photoIds.length > 0) {
      const claims = await chunkedIn(photoIds, 250, async (chunk) => {
        const { data } = await supabaseService
          .from('photo_claims')
          .select('photo_id, email, full_name, status')
          .eq('status', 'claimed')
          .in('photo_id', chunk);
        return (data ?? []) as Array<Record<string, unknown>>;
      });
      for (const c of claims) {
        claimByPhoto.set(text(c.photo_id), {
          email: text(c.email) || null,
          full_name: text(c.full_name) || null,
        });
      }
    }

    for (const p of photos) {
      const code = text(p.source_file_code);
      if (!code) continue;
      const claim = claimByPhoto.get(text(p.id));
      infoByCode.set(code, {
        email: claim?.email ?? null,
        name: claim?.full_name ?? null,
        capturedAt: text(p.captured_at) || text(p.created_at) || null,
      });
    }
  }

  const purchases = sales.map((s) => {
    const b = text(s.bild_nr);
    const info =
      infoByCode.get(b) ??
      (/^\d+$/.test(b) ? infoByCode.get(String(Number(b) % 10000)) : undefined) ??
      null;
    return {
      sold_at: s.sold_at,
      sold_local: s.sold_local,
      bild_nr: s.bild_nr,
      print_count: s.print_count,
      method: s.method,
      method_source: s.method_source,
      card_scheme: s.card_scheme ?? null,
      receipt_no: s.receipt_no ?? null,
      auth_code: s.auth_code ?? null,
      amount_cents: typeof s.amount_cents === 'number' ? s.amount_cents : priceCents,
      claimed_email: info?.email ?? null,
      claimed_name: info?.name ?? null,
      photo_captured_at: info?.capturedAt ?? null,
    };
  });

  return json({
    ok: true,
    data: {
      purchases,
      priceCents,
      truncated,
      from: from.toISOString(),
      to: to.toISOString(),
    },
  });
});
