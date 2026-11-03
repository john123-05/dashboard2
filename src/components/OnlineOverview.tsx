// Übersicht für Online-Foto-Kunden (Kalahari): Lieferverlauf bis zur Installation, Stripe-Umsatz,
// Fotos gemacht vs. gekauft, Stoßzeiten, Links und FAQ. Daten: operator-online-photo-overview.
// Bewusst englisch, weil der Kunde in den USA sitzt.
import {useEffect, useMemo, useState} from 'react';
import {Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {CheckCircle2, Circle, CreditCard, ExternalLink, Loader2, Package, Truck, Wrench, PartyPopper, Wallet, X} from 'lucide-react';
import {EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, supabase} from '../lib/supabase';
import GlassCard from './ui/GlassCard';

type Totals = {net_cents: number; payments: number; refunded_cents: number};
type Delivery = {stage: Stage; deposit_paid_on: string | null; build_started_on: string | null; shipped_on: string | null; carrier: string | null; tracking_number: string | null; tracking_url: string | null; install_planned_on: string | null; installed_on: string | null; customer_note: string | null; updated_at: string};
type Stage = 'deposit' | 'build' | 'shipping' | 'installation' | 'live';
type Data = {
  park: {name: string; timezone: string};
  shop: {unlock_mode: 'purchase' | 'email'; price_cents: number; currency: string; is_test: boolean; enabled: boolean; path: string} | null;
  revenue: {currency: string; test_mode: boolean; real: Totals; test: Totals} | null;
  period_days: number;
  totals: {photos: number; sold: number; test_sold: number; email_unlocks: number; newsletter_opt_ins: number; take_rate: number | null; busiest_hour: number | null};
  days: {date: string; photos: number; sales: number; test_sales: number; unlocks: number; revenue_cents: number; test_revenue_cents: number}[];
  hours: {hour: number; photos: number; sales: number}[];
  delivery: Delivery | null;
};

const STAGES: {id: Stage; title: string; text: string; icon: typeof Package}[] = [
  {id: 'deposit', title: 'Deposit', text: 'Order confirmed and deposit received.', icon: Wallet},
  {id: 'build', title: 'Assembly in Germany', text: 'Your photo system is built and tested in our workshop.', icon: Wrench},
  {id: 'shipping', title: 'Shipping', text: 'On its way to you — track the shipment here.', icon: Truck},
  {id: 'installation', title: 'Installation', text: 'Set-up on site and remote configuration by our team.', icon: Package},
  {id: 'live', title: 'Live', text: 'Guests find, buy and download their photos.', icon: PartyPopper},
];

const FAQ: [string, string][] = [
  ['Who receives the money from photo sales?', 'You do. Payments run through your own Stripe account, and payouts go straight to your bank account. Liftpictures never holds your revenue.'],
  ['Do I need a Stripe account?', 'Yes. We will send you a secure Stripe link to create one or connect an existing account. Stripe verifies your business and bank details directly — we never see them.'],
  ['Can we offer photos for free?', 'Yes. Under Photo shop you can switch between “Guests pay” and “Free with email”. With email, guests unlock their photo for free and can opt in to your newsletter.'],
  ['Can I change the price?', 'Yes, at any time under Photo shop. The new price applies to the next checkout.'],
  ['How do guests find their photo?', 'They scan the QR code on the photo screen, or search on your photo page by time or photo number — on site or later at home.'],
  ['What happens during installation?', 'We ship the pre-configured system, guide the set-up and finish the configuration remotely. Your dashboard switches to live data automatically.'],
];

const fmtDate = (d: string | null) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : '');
const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString('en-US', {hour: 'numeric'});

async function load(parkId: string): Promise<Data> {
  const {data: {session}} = await supabase.auth.getSession();
  if (!session) throw new Error('Authentication required');
  const r = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/operator-online-photo-overview`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY},
    body: JSON.stringify({park_id: parkId}),
  });
  const json = await r.json();
  if (!r.ok || !json.data) throw new Error(json.error ?? 'Overview unavailable');
  return json.data;
}

function Timeline({delivery}: {delivery: Delivery | null}) {
  const current = STAGES.findIndex(s => s.id === (delivery?.stage ?? 'deposit'));
  const dateFor: Record<Stage, string | null> = {
    deposit: delivery?.deposit_paid_on ?? null, build: delivery?.build_started_on ?? null, shipping: delivery?.shipped_on ?? null,
    installation: delivery?.installed_on ?? delivery?.install_planned_on ?? null, live: null,
  };
  return (
    <ol className="space-y-0">
      {STAGES.map((s, i) => {
        const done = i < current, now = i === current;
        const Icon = s.icon;
        return (
          <li key={s.id} className="relative flex gap-4 pb-6 last:pb-0">
            {i < STAGES.length - 1 && <span className={`absolute left-[17px] top-9 h-[calc(100%-28px)] w-0.5 ${done ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
            <span className={`z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-500 text-white' : now ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-100 text-slate-400'}`}>
              {done ? <CheckCircle2 size={18} /> : now ? <Icon size={18} /> : <Circle size={16} />}
            </span>
            <div className="pt-1">
              <p className={`font-semibold ${now ? 'text-blue-700' : done ? 'text-slate-800' : 'text-slate-400'}`}>
                {s.title}{now && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Current step</span>}
              </p>
              <p className={`text-sm ${done || now ? 'text-slate-600' : 'text-slate-400'}`}>{s.text}</p>
              {dateFor[s.id] && (done || now) && <p className="mt-1 text-xs text-slate-500">{s.id === 'installation' && !delivery?.installed_on ? 'Planned: ' : ''}{fmtDate(dateFor[s.id])}</p>}
              {s.id === 'shipping' && delivery?.tracking_number && (
                <p className="mt-2 text-sm">
                  {delivery.carrier ? `${delivery.carrier} · ` : ''}<span className="font-mono">{delivery.tracking_number}</span>
                  {delivery.tracking_url && <a className="ml-2 inline-flex items-center gap-1 font-medium text-blue-700 hover:underline" href={delivery.tracking_url} target="_blank" rel="noreferrer">Track shipment <ExternalLink size={13} /></a>}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Kpi({label, value, sub}: {label: string; value: string; sub?: string}) {
  return (
    <GlassCard><div className="p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div></GlassCard>
  );
}

export default function OnlineOverview({parkId}: {parkId: string}) {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [welcome, setWelcome] = useState(false), [faq, setFaq] = useState<number | null>(0);
  const welcomeKey = 'lp-online-welcome-' + parkId;

  useEffect(() => {
    let cancelled = false;
    load(parkId).then(d => {
      if (cancelled) return;
      setData(d); setError('');
      // Begrüßung mit Verlauf beim ersten Besuch, solange die Anlage noch nicht live ist.
      try { if (d.delivery && d.delivery.stage !== 'live' && localStorage.getItem(welcomeKey) !== d.delivery.stage) setWelcome(true); } catch { /* kein Speicher */ }
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [parkId, welcomeKey]);

  const currency = data?.revenue?.currency ?? data?.shop?.currency ?? 'USD';
  const money = (c: number) => new Intl.NumberFormat('en-US', {style: 'currency', currency}).format(c / 100);
  const chart = useMemo(() => (data?.days ?? []).map(d => ({...d, label: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'}), bought: d.sales + d.test_sales + d.unlocks})), [data]);
  const peak = useMemo(() => (data?.hours ?? []).filter(h => h.hour >= 7 && h.hour <= 22).map(h => ({...h, label: hourLabel(h.hour)})), [data]);
  const live = data?.delivery?.stage === 'live' || !data?.delivery;
  const shopUrl = data?.shop ? `https://liftpictures-fotos.de/${data.shop.path}/shop` : '';
  const screenUrl = data?.shop ? `https://liftpictures-fotos.de/${data.shop.path}/screen` : '';

  function closeWelcome() { setWelcome(false); try { if (data?.delivery) localStorage.setItem(welcomeKey, data.delivery.stage); } catch { /* kein Speicher */ } }

  if (error) return <GlassCard><div className="p-6"><p role="alert" className="text-red-700">The overview could not be loaded. Please reload the page.</p></div></GlassCard>;
  if (!data) return <div className="flex items-center gap-2 p-8 text-slate-500"><Loader2 className="animate-spin" size={18} /> Loading your overview…</div>;

  const t = data.totals;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-light text-slate-900">Welcome, {data.park.name}</h2>
          <p className="mt-1 text-sm text-slate-500">{live ? `Last ${data.period_days} days · ${data.park.timezone.replace('_', ' ')}` : 'Your photo system is on its way. Explore the dashboard and your guest pages in the meantime.'}</p>
        </div>
        {data.shop?.is_test && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Test mode · no real charges yet</span>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2"><div className="p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900">Your installation</h3>
            {data.delivery?.updated_at && <span className="text-xs text-slate-500">Updated {new Date(data.delivery.updated_at).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}</span>}
          </div>
          <Timeline delivery={data.delivery} />
          {data.delivery?.customer_note && <p className="mt-5 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">{data.delivery.customer_note}</p>}
        </div></GlassCard>

        <div className="space-y-6">
          <GlassCard><div className="p-6">
            <div className="flex items-center gap-2"><CreditCard size={18} className="text-blue-700" /><h3 className="font-semibold text-slate-900">Payouts with Stripe</h3></div>
            <p className="mt-3 text-sm text-slate-600">Guest payments go directly to <b>your own Stripe account</b> and are paid out to your bank. Liftpictures never holds your revenue.</p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"><Circle size={10} className="fill-amber-400 text-amber-400" /> Not connected yet — we will send you a secure Stripe link</p>
          </div></GlassCard>
          <GlassCard><div className="p-6">
            <h3 className="font-semibold text-slate-900">Your guest pages</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline" href={shopUrl} target="_blank" rel="noreferrer">Photo shop & search <ExternalLink size={13} /></a></li>
              <li><a className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline" href={screenUrl} target="_blank" rel="noreferrer">On-site photo screen <ExternalLink size={13} /></a></li>
            </ul>
            <p className="mt-3 text-xs text-slate-500">Price: {data.shop ? (data.shop.unlock_mode === 'email' ? 'Free with email' : money(data.shop.price_cents)) : '–'} · change it under Photo shop.</p>
          </div></GlassCard>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Revenue (Stripe)" value={money(data.revenue?.real.net_cents ?? 0)} sub={data.revenue?.test.payments ? `Test payments: ${money(data.revenue.test.net_cents)} (${data.revenue.test.payments})` : `${data.revenue?.real.payments ?? 0} payments`} />
        <Kpi label="Photos taken" value={t.photos.toLocaleString('en-US')} sub={`Last ${data.period_days} days`} />
        <Kpi label="Photos bought / unlocked" value={(t.sold + t.email_unlocks).toLocaleString('en-US')} sub={[t.test_sold ? `+${t.test_sold} test purchases` : '', t.email_unlocks ? `${t.email_unlocks} free with email` : ''].filter(Boolean).join(' · ') || 'Paid purchases'} />
        <Kpi label="Take rate" value={t.take_rate === null ? '–' : `${Math.round(t.take_rate * 100)} %`} sub={t.busiest_hour === null ? 'Share of photos bought' : `Busiest hour: ${hourLabel(t.busiest_hour)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <GlassCard className="lg:col-span-3"><div className="p-6">
          <h3 className="font-semibold text-slate-900">Photos taken vs. bought</h3>
          <p className="text-xs text-slate-500">Per day, including test purchases</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{left: -20, right: 8}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{fontSize: 11}} interval={4} />
                <YAxis allowDecimals={false} tick={{fontSize: 11}} />
                <Tooltip />
                <Bar dataKey="photos" name="Photos taken" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                <Line dataKey="bought" name="Bought / unlocked" stroke="#1d4ed8" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div></GlassCard>
        <GlassCard className="lg:col-span-2"><div className="p-6">
          <h3 className="font-semibold text-slate-900">Peak hours</h3>
          <p className="text-xs text-slate-500">Photos per hour of the day ({data.park.timezone.replace('_', ' ')})</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={peak} margin={{left: -20, right: 8}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{fontSize: 10}} interval={1} />
                <YAxis allowDecimals={false} tick={{fontSize: 11}} />
                <Tooltip />
                <Bar dataKey="photos" name="Photos" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="sales" name="Bought / unlocked" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div></GlassCard>
      </div>

      <GlassCard><div className="p-6">
        <h3 className="mb-3 font-semibold text-slate-900">Questions & answers</h3>
        <div className="divide-y divide-slate-200">
          {FAQ.map(([q, a], i) => (
            <div key={q}>
              <button className="flex w-full items-center justify-between py-3 text-left font-medium text-slate-800" aria-expanded={faq === i} onClick={() => setFaq(faq === i ? null : i)}>
                {q}<span className="text-slate-400">{faq === i ? '−' : '+'}</span>
              </button>
              {faq === i && <p className="pb-4 text-sm text-slate-600">{a}</p>}
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-500">More questions? Write to us under Support — we usually answer within one business day.</p>
      </div></GlassCard>

      {welcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-label="Welcome">
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
            <button className="absolute right-4 top-4 rounded-full p-1 text-slate-500 hover:bg-slate-100" onClick={closeWelcome} aria-label="Close"><X size={20} /></button>
            <h3 className="text-xl font-semibold text-slate-900">Welcome to your Liftpictures dashboard</h3>
            <p className="mt-2 text-sm text-slate-600">Here you follow your photo system from the workshop to opening day. You can already look around, check your guest pages and set your photo price.</p>
            <div className="mt-5"><Timeline delivery={data.delivery} /></div>
            <button className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700" onClick={closeWelcome}>Got it — show me around</button>
          </div>
        </div>
      )}
    </div>
  );
}
