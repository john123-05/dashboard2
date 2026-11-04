// Bausteine für Online-Foto-Parks (Kalahari): Installationsfenster (öffnet sich bei neuem Stand), Abschnitt
// „Installation“ und Karte „Stripe payouts“ in „Erste Schritte“, Stripe-Anleitung mit Link, FAQ, Gästeseiten.
// Bewusst englisch: der Kunde sitzt in den USA. Stil wie „Erste Schritte“ (weiß, --ink, Orange-Akzent).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Check, CheckCircle2, ChevronDown, Copy, CreditCard, ExternalLink, Monitor, ShoppingBag, Truck, X,
} from 'lucide-react';
import { usePark } from '../../contexts/ParkContext';
import { useI18n } from '../../lib/i18n';
import { fetchOnlineSummary, isOnlinePark, type DeliveryStep, type OnlineSummary } from '../../lib/onlinePark';
import Modal from '../ui/Modal';
import ProgressRing from '../onboarding/ProgressRing';

const OPEN_EVENT = 'lp:open-installation';
export function openInstallation(tab: Tab = 'progress') {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: tab }));
}

type Tab = 'progress' | 'stripe' | 'faq';

export function useOnlineSummary(parkId: string | null | undefined) {
  const [data, setData] = useState<OnlineSummary | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    setData(null); setError(false);
    if (!isOnlinePark(parkId)) return;
    let cancelled = false;
    fetchOnlineSummary(parkId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [parkId]);
  return { data, error };
}

function progressOf(steps: DeliveryStep[]) {
  const total = steps.length;
  const done = steps.filter((s) => s.status === 'done').length;
  const current = steps.find((s) => s.status === 'current') ?? steps.find((s) => s.status === 'upcoming') ?? null;
  const live = total > 0 && done === total;
  return { total, done, current, live, percent: total ? Math.round(((done + (current?.status === 'current' ? 0.5 : 0)) / total) * 100) : 0 };
}

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

/* ------------------------------------------------------------------ Lieferverlauf */

function Steps({ steps }: { steps: DeliveryStep[] }) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const done = s.status === 'done', now = s.status === 'current';
        const last = i === steps.length - 1;
        return (
          <li key={s.id} className="relative flex gap-4 pb-5 last:pb-0">
            {!last && (
              <span
                aria-hidden
                className={`absolute left-[13px] top-8 h-[calc(100%-24px)] w-px ${done ? 'bg-[color:var(--ink)]' : 'bg-[color:var(--line-strong)]'}`}
              />
            )}
            <span
              className={`z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                done
                  ? 'bg-[color:var(--ink)] text-white'
                  : now
                    ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                    : 'border border-[color:var(--line-strong)] bg-white text-[color:var(--ink-3)]'
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <div className={`min-w-0 flex-1 rounded-lg ${now ? 'border border-brand-200 bg-brand-50/60 px-3 py-2.5' : 'pt-0.5'}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className={`text-sm font-semibold ${done || now ? 'text-[color:var(--ink)]' : 'text-[color:var(--ink-3)]'}`}>{s.title}</p>
                {now && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">In progress</span>}
                {s.step_date && <span className="text-xs text-[color:var(--ink-3)]">{fmtDate(s.step_date)}</span>}
              </div>
              {s.description && (
                <p className={`mt-0.5 text-sm ${done || now ? 'text-[color:var(--ink-2)]' : 'text-[color:var(--ink-3)]'}`}>{s.description}</p>
              )}
              {s.tracking_number && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--line)] bg-white px-2.5 py-1.5 text-xs">
                  <Truck className="h-3.5 w-3.5 text-[color:var(--ink-3)]" />
                  {s.carrier && <span className="text-[color:var(--ink-2)]">{s.carrier}</span>}
                  <span className="font-mono text-[color:var(--ink)]">{s.tracking_number}</span>
                  {s.tracking_url && (
                    <a className="ml-auto inline-flex items-center gap-1 font-medium text-brand-700 hover:underline" href={s.tracking_url} target="_blank" rel="noreferrer">
                      Track shipment <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ Stripe */

type StripeScene = 'link' | 'signin' | 'business' | 'bank' | 'done';
const STRIPE_STEPS: { scene: StripeScene; title: string; text: string }[] = [
  { scene: 'link', title: 'Open your Stripe link', text: 'As soon as we have created it, your secure link appears right here. Tap “Open Stripe setup”. Nothing to install.' },
  { scene: 'signin', title: 'Sign in or create your Stripe account', text: 'Use your business email. If Kalahari already uses Stripe, simply sign in to that account.' },
  { scene: 'business', title: 'Enter your business details', text: 'Legal business name, EIN, address and one representative. Stripe asks this by law to verify the business.' },
  { scene: 'bank', title: 'Add the bank account for payouts', text: 'This is where Stripe sends the money from photo sales, usually within 2 business days.' },
  { scene: 'done', title: 'Done – it switches to “Connected”', text: 'From then on every guest payment goes straight into your own Stripe account. Liftpictures takes no commission.' },
];

/** Markiertes Ziel wie in der App-Anleitung: Rahmen pulsiert, ein Zeiger „tippt“. */
function Hot({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <span className="absolute -inset-1 animate-pulse rounded-md ring-2 ring-brand-500" aria-hidden />
      {children}
      <span className="lp-pointer pointer-events-none absolute -bottom-3 -right-2 h-4 w-4 rounded-full border-2 border-white bg-brand-600 shadow-md" aria-hidden />
    </span>
  );
}
const bar = (w: string) => <span className={`block h-1.5 rounded-full bg-slate-200 ${w}`} />;
function StripeWindow({ address, children }: { address: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[380px] text-[9px] text-slate-600">
      <div className="relative h-[190px] overflow-hidden rounded-lg border border-slate-300 bg-white shadow-md">
        <div className="flex h-7 items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-2">
          <span className="h-2 w-2 rounded-full bg-rose-300" /><span className="h-2 w-2 rounded-full bg-amber-300" /><span className="h-2 w-2 rounded-full bg-emerald-300" />
          <span className="ml-1 flex h-4 min-w-0 flex-1 items-center rounded bg-white px-1.5"><span className="truncate">{address}</span></span>
        </div>
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}
function StripeSketch({ scene }: { scene: StripeScene }) {
  const stripe = <span className="font-bold tracking-tight text-[#635bff]">stripe</span>;
  const field = (label: string) => (
    <div className="space-y-0.5"><span className="text-slate-500">{label}</span><span className="block h-4 rounded border border-slate-200 bg-white" /></div>
  );
  switch (scene) {
    case 'link':
      return (
        <StripeWindow address="dashboard-liftpictures.com/start">
          <div className="space-y-2">
            <p className="font-semibold text-slate-800">Stripe payouts</p>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-emerald-800">Your Stripe link is ready</div>
            <Hot><span className="rounded-md bg-brand-600 px-2 py-1 font-semibold text-white">Open Stripe setup ↗</span></Hot>
          </div>
        </StripeWindow>
      );
    case 'signin':
      return (
        <StripeWindow address="connect.stripe.com">
          <div className="mx-auto max-w-[220px] space-y-2">
            <p className="text-center text-[11px]">{stripe}</p>
            {field('Email')}
            <Hot className="w-full"><span className="block w-full rounded bg-[#635bff] py-1 text-center font-semibold text-white">Continue</span></Hot>
          </div>
        </StripeWindow>
      );
    case 'business':
      return (
        <StripeWindow address="connect.stripe.com">
          <div className="mx-auto max-w-[240px] space-y-1.5">
            <p className="font-semibold text-slate-800">Tell us about your business</p>
            {field('Legal business name')}
            <div className="grid grid-cols-2 gap-1.5">{field('EIN')}{field('Address')}</div>
            <div className="flex justify-end"><Hot><span className="rounded bg-[#635bff] px-2 py-0.5 font-semibold text-white">Continue</span></Hot></div>
          </div>
        </StripeWindow>
      );
    case 'bank':
      return (
        <StripeWindow address="connect.stripe.com">
          <div className="mx-auto max-w-[240px] space-y-1.5">
            <p className="font-semibold text-slate-800">Add a bank account for payouts</p>
            <div className="grid grid-cols-2 gap-1.5">{field('Routing number')}{field('Account number')}</div>
            {bar('w-2/3')}
            <div className="flex justify-end"><Hot><span className="rounded bg-[#635bff] px-2 py-0.5 font-semibold text-white">Save</span></Hot></div>
          </div>
        </StripeWindow>
      );
    case 'done':
      return (
        <StripeWindow address="dashboard-liftpictures.com/start">
          <div className="space-y-2">
            <p className="font-semibold text-slate-800">Stripe payouts</p>
            <Hot><span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-200"><Check className="h-3 w-3" /> Connected</span></Hot>
            {bar('w-3/4')}{bar('w-1/2')}
          </div>
        </StripeWindow>
      );
  }
}

/** Stand + Link + bewegte Schritt-für-Schritt-Anleitung (wie „Liftbase als App“). */
export function StripeGuide({ connected, testMode, link }: { connected: boolean; testMode: boolean; link?: string | null }) {
  const [index, setIndex] = useState(link ? 0 : 0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || index >= STRIPE_STEPS.length - 1) return;
    const timer = window.setTimeout(() => setIndex((i) => Math.min(STRIPE_STEPS.length - 1, i + 1)), 4500);
    return () => window.clearTimeout(timer);
  }, [auto, index]);
  const go = (n: number) => { setAuto(false); setIndex(Math.max(0, Math.min(STRIPE_STEPS.length - 1, n))); };
  const step = STRIPE_STEPS[index];
  return (
    <div className="space-y-4">
      {connected ? (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Your Stripe account is connected. Guest payments go directly to you.</p>
        </div>
      ) : link ? (
        <div className="flex flex-col gap-3 rounded-lg border border-brand-200 bg-brand-50/70 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[color:var(--ink)]">Your Stripe link is ready</p>
            <p className="text-sm text-[color:var(--ink-2)]">Open it now and follow the steps below. It takes about 10 minutes.</p>
          </div>
          <a href={link} target="_blank" rel="noreferrer" className="glass-button-primary justify-center">
            Open Stripe setup <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-[color:var(--line)] bg-slate-50 p-3 text-sm text-[color:var(--ink-2)]">
          <CreditCard className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            We will create a secure Stripe link for you. It will appear right here, together with a notice in your dashboard.
            {testMode && ' Until then the shop runs in test mode: no real money is charged.'}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:items-center">
        <div className="flex min-h-[230px] items-center justify-center rounded-xl bg-slate-50 p-4">
          <div key={step.scene} className="lp-scene-in w-full"><StripeSketch scene={step.scene} /></div>
        </div>
        <div>
          <p className="text-xs font-semibold text-brand-700">Stripe payouts</p>
          <p className="mt-0.5 text-xs text-[color:var(--ink-3)]">Step {index + 1} of {STRIPE_STEPS.length}</p>
          <p className="mt-2 text-base font-semibold text-[color:var(--ink)]">{step.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-[color:var(--ink-2)]">{step.text}</p>
          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="glass-button-secondary disabled:opacity-40">‹ Back</button>
            {index < STRIPE_STEPS.length - 1
              ? <button type="button" onClick={() => go(index + 1)} className="glass-button-secondary">Next ›</button>
              : <button type="button" onClick={() => { setIndex(0); setAuto(true); }} className="glass-button-secondary">Show again</button>}
          </div>
          <div className="mt-3 flex gap-1.5" aria-hidden>
            {STRIPE_STEPS.map((s, i) => (
              <button key={s.scene} type="button" tabIndex={-1} onClick={() => go(i)} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-brand-600' : 'w-3 bg-slate-200'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[color:var(--line)] p-3 text-sm text-[color:var(--ink-2)]">
        <p className="font-semibold text-[color:var(--ink)]">Good to know</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5">
          <li>Liftpictures takes no commission on photo sales. All revenue is yours.</li>
          <li>Stripe charges its usual card fee directly to your account (standard US pricing: 2.9% + 30¢ per payment).</li>
          <li>We never see your bank or tax details. Stripe stores them.</li>
        </ul>
      </div>
    </div>
  );
}

/** Karte „Stripe payouts“ in „Erste Schritte“ – gleiche Machart wie „Liftbase als App“, steht davor. */
export function StripeSetupCard() {
  const { parkId } = usePark();
  const { data } = useOnlineSummary(parkId);
  const connected = Boolean(data?.shop?.stripe_connected);
  const link = data?.shop?.stripe_onboarding_url ?? null;
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    if (window.location.hash === '#stripe') {
      setOpen(true);
      window.setTimeout(() => document.getElementById('stripe')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  }, [data]);
  if (!data?.shop) return null;
  const show = open ?? !connected;
  return (
    <div className="glass-panel animate-slide-up scroll-mt-6 overflow-hidden rounded-2xl p-0">
      <div id="stripe" />
      <button type="button" onClick={() => setOpen(!show)} aria-expanded={show} className="flex w-full items-center gap-4 px-4 py-4 text-left sm:px-5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${connected ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700'}`}>
          {connected ? <Check className="h-4 w-4" strokeWidth={3} /> : <CreditCard className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-base font-semibold text-[color:var(--ink)]">
            Stripe payouts – get paid directly
            {!connected && link && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Link ready</span>}
          </span>
          <span className="block text-xs text-[color:var(--ink-3)]">About 10 minutes: connect your Stripe account, guest payments go straight to your bank.</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[color:var(--ink-3)] transition-transform ${show ? 'rotate-180' : ''}`} />
      </button>
      {show && (
        <div className="border-t border-[color:var(--line)] p-4 sm:p-5">
          <StripeGuide connected={connected} testMode={Boolean(data.shop.is_test)} link={link} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ FAQ */

const FAQ: [string, string][] = [
  ['Who receives the money from photo sales?', 'You do. Payments run through your own Stripe account and are paid out to your bank. Liftpictures never holds your revenue.'],
  ['Can we offer photos for free?', 'Yes. Under Online shop you can switch between “Guests pay” and “Free with email”. With email, guests unlock their photo for free and can opt in to your newsletter.'],
  ['Can I change the price?', 'Yes, at any time under Online shop. The new price applies to the next checkout.'],
  ['How do guests find their photo?', 'They scan the QR code on the photo screen next to the attraction, or search on your photo page by time or photo number, on site or later at home.'],
  ['What happens during installation?', 'We ship the pre-configured system, guide the set-up on site and finish the configuration remotely. Your dashboard then shows live data automatically.'],
  ['Who do I contact with questions?', 'Use Support in the menu on the left. We usually answer within one business day.'],
];

export function OnlineFaq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-[color:var(--line)] rounded-lg border border-[color:var(--line)]">
      {FAQ.map(([q, a], i) => (
        <div key={q}>
          <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-[color:var(--ink)] hover:bg-slate-50">
            {q}
            <span className={`text-[color:var(--ink-3)] transition ${open === i ? 'rotate-45' : ''}`} aria-hidden>+</span>
          </button>
          {open === i && <p className="px-4 pb-3 text-sm text-[color:var(--ink-2)]">{a}</p>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Inhalt (Fenster und Seite) */

function Tabs({ tab, setTab, withStripe = true }: { tab: Tab; setTab: (t: Tab) => void; withStripe?: boolean }) {
  const items: [Tab, string][] = [['progress', 'Installation'], ...(withStripe ? [['stripe', 'Stripe payouts'] as [Tab, string]] : []), ['faq', 'Questions']];
  return (
    <div className="inline-flex rounded-md border border-[color:var(--line-strong)] p-0.5" role="tablist">
      {items.map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
          className={`rounded px-3 py-1.5 text-xs font-medium transition ${tab === id ? 'bg-[color:var(--ink)] text-white' : 'text-[color:var(--ink-2)] hover:bg-slate-100'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function InstallationBody({ data, tab }: { data: OnlineSummary; tab: Tab }) {
  const steps = data.delivery.steps;
  if (tab === 'stripe') return <StripeGuide connected={Boolean(data.shop?.stripe_connected)} testMode={Boolean(data.shop?.is_test)} link={data.shop?.stripe_onboarding_url} />;
  if (tab === 'faq') return <OnlineFaq />;
  return (
    <div className="space-y-4">
      {steps.length ? <Steps steps={steps} /> : <p className="text-sm text-[color:var(--ink-3)]">We will add your installation plan here shortly.</p>}
      {data.delivery.customer_note && (
        <p className="rounded-lg border border-[color:var(--line)] bg-slate-50 p-3 text-sm text-[color:var(--ink-2)]">{data.delivery.customer_note}</p>
      )}
    </div>
  );
}

function Header({ data }: { data: OnlineSummary }) {
  const p = progressOf(data.delivery.steps);
  return (
    <div className="flex items-center gap-4">
      <ProgressRing percent={p.live ? 100 : p.percent} size={52}>
        <span className="text-[11px] font-semibold text-[color:var(--ink)]">{p.done}/{p.total}</span>
      </ProgressRing>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[color:var(--ink-3)]">{p.live ? 'Installation complete' : 'Your installation'}</p>
        <p id="installation-title" className="truncate text-lg font-semibold text-[color:var(--ink)]">
          {p.live ? 'Your photo system is live' : p.current?.title ?? 'Getting started'}
        </p>
        {data.delivery.updated_at && (
          <p className="text-xs text-[color:var(--ink-3)]">Updated {new Date(data.delivery.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
        )}
      </div>
    </div>
  );
}

export function InstallationDialog({ data, initialTab, onClose }: { data: OnlineSummary; initialTab: Tab; onClose: () => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <Modal onClose={onClose} labelledBy="installation-title" panelClassName="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[color:var(--line)] bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line)] px-5 pb-4 pt-5">
        <Header data={data} />
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-2 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-5 pt-4"><Tabs tab={tab} setTab={setTab} /></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4"><InstallationBody data={data} tab={tab} /></div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--line)] bg-slate-50 px-5 py-3">
        <p className="text-xs text-[color:var(--ink-3)]">You find this any time under “{t('ob.card_title')}” in the menu.</p>
        <div className="flex gap-2">
          <Link to="/start#installation" onClick={onClose} className="glass-button-secondary">{t('ob.card_title')}</Link>
          <button type="button" onClick={onClose} className="glass-button-primary">Got it</button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Im Layout eingehängt: öffnet das Fenster beim ersten Besuch und von selbst einmal, sobald sich ein Schritt
 * geändert hat (je Browser gemerkt). Nach dem Schließen zeigt ein kleiner Hinweis an der Seitenleiste, dass der
 * Stand immer unter „Erste Schritte“ steht – mit Knopf direkt dorthin.
 */
export function InstallationHost() {
  const { parkId } = usePark();
  const { data } = useOnlineSummary(parkId);
  const [open, setOpen] = useState<Tab | null>(null);
  const [hint, setHint] = useState(false);
  // Neuer Stand = Schritt geändert ODER Stripe-Link erschienen/verbunden – dann öffnet sich das Fenster einmal.
  const signature = useMemo(() => data
    ? `${data.delivery.steps.map((s) => `${s.id}:${s.status}`).join('|')}|link:${data.shop?.stripe_onboarding_url ? 1 : 0}|conn:${data.shop?.stripe_connected ? 1 : 0}`
    : '', [data]);

  useEffect(() => {
    const onOpen = (e: Event) => setOpen(((e as CustomEvent).detail as Tab) || 'progress');
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!data || !parkId || !signature) return;
    const key = `installation-seen:${parkId}`;
    try {
      const before = localStorage.getItem(key);
      if (before !== signature) {
        const linkNew = signature.includes('link:1') && !(before ?? '').includes('link:1') && !signature.includes('conn:1');
        setOpen(linkNew ? 'stripe' : 'progress');
        localStorage.setItem(key, signature);
      }
    } catch { /* ohne Speicher kein automatisches Öffnen */ }
  }, [data, parkId, signature]);

  function close() {
    setOpen(null);
    // Den Hinweis nur zeigen, bis der Kunde ihn einmal bestätigt hat.
    try { if (parkId && !localStorage.getItem(`installation-hint:${parkId}`)) setHint(true); } catch { setHint(true); }
  }
  function dismissHint() {
    setHint(false);
    try { if (parkId) localStorage.setItem(`installation-hint:${parkId}`, '1'); } catch { /* egal */ }
  }

  if (!data) return null;
  return (
    <>
      {open && <InstallationDialog data={data} initialTab={open} onClose={close} />}
      {hint && !open && <WhereToFind onDone={dismissHint} />}
    </>
  );
}

/** Zeigt auf „Erste Schritte“ in der Seitenleiste (oder unten mittig, wenn die Leiste zu ist). */
function WhereToFind({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('[data-nav="start"]');
    const measure = () => {
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 && r.right < window.innerWidth / 2 ? r : null);
    };
    measure();
    el?.classList.add('lp-nav-pulse');
    window.addEventListener('resize', measure);
    return () => { window.removeEventListener('resize', measure); el?.classList.remove('lp-nav-pulse'); };
  }, []);
  const style = rect
    ? { left: rect.right + 14, top: Math.max(12, rect.top + rect.height / 2 - 70) }
    : { left: '50%', bottom: 96, transform: 'translateX(-50%)' };
  return (
    <div role="dialog" aria-label={t('ob.card_title')} style={style}
      className="fixed z-[96] w-[min(320px,calc(100vw-2rem))] rounded-xl border border-[color:var(--line-strong)] bg-white p-4 shadow-[0_16px_48px_rgba(16,24,40,0.22)]">
      {rect && <span aria-hidden className="absolute -left-[7px] top-[62px] h-3 w-3 rotate-45 border-b border-l border-[color:var(--line-strong)] bg-white" />}
      <p className="text-sm font-semibold text-[color:var(--ink)]">Your status is always here</p>
      <p className="mt-1 text-sm text-[color:var(--ink-2)]">
        Open “{t('ob.card_title')}” in the menu any time to see where your installation stands, track the shipment and set up Stripe payouts.
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="glass-button-primary" onClick={() => { onDone(); navigate('/start#installation'); }}>Show me</button>
        <button type="button" className="glass-button-secondary" onClick={onDone}>Got it</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Stripe-Karte (Übersicht) */

export function OnlinePayoutsCard({ data }: { data: OnlineSummary }) {
  const r = data.revenue;
  const money = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: r?.currency ?? data.shop?.currency ?? 'USD' }).format(c / 100);
  const connected = Boolean(data.shop?.stripe_connected);
  return (
    <div className="glass-panel animate-slide-up flex flex-col rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-800">Stripe payouts</h3>
        <span className={`inline-flex items-center gap-1.5 text-xs ${connected ? 'text-emerald-700' : 'text-amber-700'}`}>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden />
          {connected ? 'Connected' : 'Not connected yet'}
        </span>
      </div>
      <p className="mt-4 text-sm text-slate-500">Revenue (all time)</p>
      <p className="text-2xl font-light text-[color:var(--ink)]">{money(r?.real.net_cents ?? 0)}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-center justify-between"><dt className="text-slate-500">Payments</dt><dd className="font-semibold text-slate-700">{r?.real.payments ?? 0}</dd></div>
        {(r?.test.payments ?? 0) > 0 && (
          <div className="flex items-center justify-between"><dt className="text-slate-500">Test payments</dt><dd className="text-slate-500">{r?.test.payments} · {money(r?.test.net_cents ?? 0)}</dd></div>
        )}
        <div className="flex items-center justify-between"><dt className="text-slate-500">Liftpictures commission</dt><dd className="font-semibold text-slate-700">0 %</dd></div>
      </dl>
      <p className="mt-3 text-xs text-slate-500">Guest payments go to your own Stripe account and are paid out to your bank.</p>
      {!connected && (
        <button type="button" onClick={() => openInstallation('stripe')} className="glass-button-secondary mt-4 w-full justify-center">
          How to connect Stripe
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Gästeseiten */

function qr(url: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=168x168&margin=8&data=${encodeURIComponent(url)}`;
}

function PagePreview({ url, title }: { url: string; title: string }) {
  // Live-Vorschau der echten Seite: 1280 px breit gerendert und auf die Kachel verkleinert.
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const fit = () => setScale(el.clientWidth / 1280);
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative aspect-[16/10] overflow-hidden rounded-t-xl border-b border-[color:var(--line)] bg-slate-100">
      <div className="absolute inset-x-0 top-0 z-10 flex h-6 items-center gap-1.5 border-b border-[color:var(--line)] bg-white px-2.5">
        <span className="h-2 w-2 rounded-full bg-slate-300" /><span className="h-2 w-2 rounded-full bg-slate-300" /><span className="h-2 w-2 rounded-full bg-slate-300" />
        <span className="ml-2 truncate text-[10px] text-[color:var(--ink-3)]">{url.replace('https://', '')}</span>
      </div>
      <iframe title={title} src={url} loading="lazy" tabIndex={-1} aria-hidden
        className="pointer-events-none absolute left-0 top-6 origin-top-left border-0"
        style={{ width: 1280, height: 800, transform: `scale(${scale})` }} />
    </div>
  );
}

function GuestPage({ icon: Icon, title, text, url, children }: { icon: typeof Monitor; title: string; text: string; url: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[color:var(--line)] bg-white">
      <PagePreview url={url} title={title} />
      <div className="flex flex-1 gap-4 p-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ink)]"><Icon className="h-4 w-4 text-[color:var(--ink-3)]" />{title}</p>
          <p className="mt-1 text-sm text-[color:var(--ink-2)]">{text}</p>
          {children}
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={url} target="_blank" rel="noreferrer" className="glass-button-primary">Open <ExternalLink className="h-3.5 w-3.5" /></a>
            <button type="button" className="glass-button-secondary" onClick={() => {
              void navigator.clipboard?.writeText(url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); });
            }}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>
        <img src={qr(url)} alt={`QR code for ${title}`} className="hidden h-24 w-24 shrink-0 self-end rounded-md border border-[color:var(--line)] sm:block" loading="lazy" />
      </div>
    </div>
  );
}

export function GuestPagesCard({ data, settingsLink = true }: { data: OnlineSummary; settingsLink?: boolean }) {
  if (!data.shop) return null;
  const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: data.shop.currency }).format(data.shop.price_cents / 100);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-[color:var(--ink)]">Your guest pages</h3>
          <p className="text-sm text-[color:var(--ink-3)]">What your guests see. Live previews of the real pages.</p>
        </div>
        {settingsLink && <Link to="/shop" className="text-sm font-medium text-brand-700 hover:underline">Price & unlock settings</Link>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <GuestPage icon={ShoppingBag} title="Photo shop & search" url={data.shop.shop_url}
          text="Guests find their photo by time or photo number and buy it on the web, or scan the QR code to finish on their phone.">
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-[color:var(--ink-2)]">
            {data.shop.unlock_mode === 'email' ? 'Free with email' : `${price} per photo`}
            {data.shop.is_test && <span className="font-medium text-amber-700">· test mode</span>}
          </p>
        </GuestPage>
        <GuestPage icon={Monitor} title="On-site photo screen" url={data.shop.screen_url}
          text="Runs on the screen next to the attraction. New photos appear automatically, each with its own QR code." />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Abschnitt in „Erste Schritte“ */

/** Installation als erster Abschnitt der Seite „Erste Schritte“ – eine Stelle für alles, was der Kunde tun muss. */
export function InstallationSection() {
  const { parkId } = usePark();
  const { data } = useOnlineSummary(parkId);
  const [tab, setTab] = useState<Tab>('progress');
  useEffect(() => {
    if (window.location.hash === '#installation') {
      window.setTimeout(() => document.getElementById('installation')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  }, [data]);
  if (!data || !data.delivery.steps.length) return null;
  return (
    <section id="installation" className="scroll-mt-6 rounded-xl border border-[color:var(--line)] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Header data={data} />
        <Tabs tab={tab} setTab={setTab} withStripe={false} />
      </div>
      <div className="mt-5"><InstallationBody data={data} tab={tab} /></div>
    </section>
  );
}

/** Kurzfassung für die Karte „Erste Schritte“ auf der Übersicht. */
export function installationLine(data: OnlineSummary | null) {
  if (!data) return null;
  const p = progressOf(data.delivery.steps);
  if (!p.total || p.live) return null;
  return { done: p.done, total: p.total, title: p.current?.title ?? '' };
}
