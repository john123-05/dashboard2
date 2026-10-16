import { handleOptions, json, requireAdminFromRequest, supabaseService } from '../_shared/sameProjectAdminAuth.ts';

// Übersicht für das Liftpictures-CRM (Kundenmanagement → Übersicht): je Kunde auf einen Blick,
// ob die PCs laufen, Umsatz und verkaufte Bilder heute, gesammelte E-Mails und Umfragen.
// Umsatz kommt aus park_machine_revenue (Fotopreis als Ersatz, wenn der Automat keinen Betrag meldet),
// "heute" jeweils in der Zeitzone des Parks.

const ONLINE_MINUTES = 5;

function dayIn(tz: string, d = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(d);
  }
}

export async function handler(req: Request): Promise<Response> {
  const pre = handleOptions(req);
  if (pre) return pre;
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  try {
    const since14 = new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10);
    const since36h = new Date(Date.now() - 36 * 3600000).toISOString();
    const [parksR, cfgR, statusR, salesR, claimsR] = await Promise.all([
      supabaseService.from('parks').select('id, name, slug, timezone, price_per_photo_cents').eq('is_active', true).order('name'),
      supabaseService.from('liftpic_machine_configs').select('park_id, machine_id, machine_label, last_seen_at, is_active').eq('is_active', true),
      supabaseService.from('machine_status').select('machine_id, park_id, last_seen_at, photos_taken_today, photos_sold_today, paper_remaining, queue_count'),
      supabaseService.from('park_photo_sales_daily').select('park_id, business_date, photos_sold_count').gte('business_date', since14),
      supabaseService.from('photo_claims').select('park_id, email, phone, marketing_opt_in, survey_response_id, created_at').gte('created_at', since36h),
    ]);
    const err = parksR.error || cfgR.error || statusR.error || salesR.error || claimsR.error;
    if (err) return json({ error: err.message }, 500);

    const parks = parksR.data ?? [];
    const revenue = await Promise.all(
      parks.map(async (p) => {
        const { data } = await supabaseService.rpc('park_machine_revenue', { p_park_id: p.id });
        const rows = (data ?? []) as Array<{ heute_anzahl: number; heute_cent: number; monat_cent: number; monat_anzahl: number }>;
        return {
          id: p.id,
          heute_anzahl: rows.reduce((a, r) => a + Number(r.heute_anzahl || 0), 0),
          heute_cent: rows.reduce((a, r) => a + Number(r.heute_cent || 0), 0),
          monat_cent: rows.reduce((a, r) => a + Number(r.monat_cent || 0), 0),
          monat_anzahl: rows.reduce((a, r) => a + Number(r.monat_anzahl || 0), 0),
          hat_ledger: rows.length > 0,
        };
      }),
    );
    const revById = new Map(revenue.map((r) => [r.id, r]));
    const statusByMachine = new Map((statusR.data ?? []).map((s) => [s.machine_id, s]));
    const now = Date.now();

    const customers = parks.map((p) => {
      const tz = p.timezone || 'Europe/Vienna';
      const today = dayIn(tz);
      const machines = (cfgR.data ?? [])
        .filter((m) => m.park_id === p.id)
        .map((m) => {
          const st = statusByMachine.get(m.machine_id);
          const seen = st?.last_seen_at ?? m.last_seen_at ?? null;
          const minutes = seen ? Math.round((now - new Date(seen).getTime()) / 60000) : null;
          return {
            machine_id: m.machine_id,
            label: m.machine_label || m.machine_id,
            online: minutes !== null && minutes <= ONLINE_MINUTES,
            offline_minutes: minutes,
            rides_today: st?.photos_taken_today ?? null,
            paper_remaining: st?.paper_remaining ?? null,
            queue: st?.queue_count ?? null,
          };
        });
      const days = (salesR.data ?? []).filter((s) => s.park_id === p.id);
      const soldRollupToday = days.filter((d) => d.business_date === today).reduce((a, d) => a + (d.photos_sold_count || 0), 0);
      const trend: number[] = [];
      for (let i = 13; i >= 0; i -= 1) {
        const key = dayIn(tz, new Date(now - i * 86400000));
        trend.push(days.filter((d) => d.business_date === key).reduce((a, d) => a + (d.photos_sold_count || 0), 0));
      }
      const claimsToday = (claimsR.data ?? []).filter((c) => c.park_id === p.id && dayIn(tz, new Date(c.created_at)) === today);
      const rev = revById.get(p.id);
      const price = p.price_per_photo_cents ?? 500;
      // Verkäufe: Automaten-Protokoll, sonst die Tagessumme der Fotos.
      const sold = rev?.hat_ledger ? rev.heute_anzahl : soldRollupToday;
      const revenueCents = rev?.hat_ledger ? rev.heute_cent : soldRollupToday * price;
      const rides = machines.reduce((a, m) => a + (m.rides_today ?? 0), 0);
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        timezone: tz,
        price_cents: price,
        machines,
        online: machines.length > 0 && machines.every((m) => m.online),
        some_online: machines.some((m) => m.online),
        today: {
          sold,
          revenue_cents: revenueCents,
          rides: rides || null,
          conversion: rides ? sold / rides : null,
          claims: claimsToday.length,
          emails: claimsToday.filter((c) => (c.email ?? '').trim() !== '').length,
          phones: claimsToday.filter((c) => (c.phone ?? '').trim() !== '').length,
          opt_in: claimsToday.filter((c) => c.marketing_opt_in).length,
          surveys: claimsToday.filter((c) => c.survey_response_id).length,
        },
        month: { revenue_cents: rev?.monat_cent ?? 0, sold: rev?.monat_anzahl ?? 0 },
        trend,
      };
    });

    const sum = (f: (c: (typeof customers)[number]) => number) => customers.reduce((a, c) => a + f(c), 0);
    return json({
      ok: true,
      data: {
        generated_at: new Date().toISOString(),
        totals: {
          revenue_cents: sum((c) => c.today.revenue_cents),
          sold: sum((c) => c.today.sold),
          emails: sum((c) => c.today.emails),
          surveys: sum((c) => c.today.surveys),
          machines: sum((c) => c.machines.length),
          machines_online: sum((c) => c.machines.filter((m) => m.online).length),
          month_revenue_cents: sum((c) => c.month.revenue_cents),
        },
        customers,
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Übersicht nicht verfügbar' }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
