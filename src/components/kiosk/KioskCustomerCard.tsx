// Personalisierung > "Verkaufsprogramm am Automaten": Live-Vorschau der echten App (public/kiosk,
// aus testsoftware) mit den Einstellungen dieses Automaten, daneben Stand und - nur für die Teile,
// die Liftpictures im CRM freigegeben hat - Einstellungen zum Selbständern (Preise, Texte, Design …).
// Erscheint nur für Automaten mit freigeschaltetem Verkaufsprogramm.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { useI18n } from '../../lib/i18n';
import { supabase, EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '../../lib/supabase';
import { DEFAULT_CONFIG, LANGS, THEMES, mergeConfig, type Format, type KioskConfig, type Lang, type Package } from './kioskConfig';

const URL_FN = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-kiosk`;
type Obj = Record<string, unknown>;

type Machine = {
  id: string;
  machine_id: string;
  machine_label: string | null;
  config: Obj;
  has_vouchers: boolean;
  allowed: string[];
  valid_until: string | null;
  status: { licensed?: boolean; reason?: string | null; photos?: number; running?: boolean | null; sales_today?: { count: number; amount_cents: number } | null } | null;
};

async function headers() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('not signed in');
  return { Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
}

function useKioskMachines(parkId: string | null) {
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const load = useCallback(async () => {
    if (!parkId) { setMachines([]); return; }
    try {
      const res = await fetch(`${URL_FN}?park_id=${encodeURIComponent(parkId)}`, { headers: await headers() });
      const body = await res.json().catch(() => null);
      setMachines(res.ok && Array.isArray(body?.data) ? body.data : []);
    } catch {
      setMachines([]);
    }
  }, [parkId]);
  useEffect(() => { void load(); }, [load]);
  return { machines, reload: load };
}

/** Nur was von den Vorgaben abweicht (wie im CRM). */
function diffConfig(base: unknown, value: unknown): unknown {
  if (Array.isArray(value) || typeof value !== 'object' || value === null) {
    return JSON.stringify(base) === JSON.stringify(value) ? undefined : value;
  }
  const out: Obj = {};
  for (const [k, v] of Object.entries(value as Obj)) {
    const d = diffConfig((base as Obj | undefined)?.[k], v);
    if (d !== undefined) out[k] = d;
  }
  return Object.keys(out).length ? out : undefined;
}

const SCREENS = ['attract', 'gallery', 'scan', 'detail', 'products', 'print_home', 'cart', 'method', 'card', 'cash', 'success'];
const euro = (c: number) => (c / 100).toFixed(2).replace('.', ',');

function Price({ label, value, onChange }: { label: string; value: number; onChange: (c: number) => void }) {
  const [text, setText] = useState(euro(value));
  useEffect(() => setText(euro(value)), [value]);
  return (
    <label className="block text-sm text-[color:var(--ink-3)]">{label}
      <input className="glass-input mt-1 py-1.5" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(Math.max(0, Math.round(Number(text.replace(',', '.')) * 100) || 0))} />
    </label>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 py-1 text-sm text-[color:var(--ink)]">
      <input type="checkbox" className="h-4 w-4 accent-[color:var(--accent,#c2410c)]" checked={on} onChange={(e) => onChange(e.target.checked)} />{label}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[color:var(--line)] py-4 last:border-0">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--ink-3)]">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export default function KioskCustomerCard({ parkId, parkName }: { parkId: string | null; parkName?: string | null }) {
  const { t } = useI18n();
  const { machines, reload } = useKioskMachines(parkId);
  const [selected, setSelected] = useState(0);
  const m = machines?.[Math.min(selected, (machines?.length ?? 1) - 1)] ?? null;
  const [cfg, setCfg] = useState<KioskConfig>(DEFAULT_CONFIG);
  const [screen, setScreen] = useState('gallery');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [vKind, setVKind] = useState<'day' | 'photos'>('day');
  const [vDay, setVDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [vPhotos, setVPhotos] = useState(1);
  const [messageLang, setMessageLang] = useState<Lang>('de');
  const [vCount, setVCount] = useState(20);
  const [codes, setCodes] = useState<string[]>([]);
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  const base = useMemo(() => ({ park_name: parkName || DEFAULT_CONFIG.park_name }), [parkName]);
  useEffect(() => { if (m) { setCfg(mergeConfig(base, m.config)); setMsg(''); setCodes([]); } }, [m, base]);
  const stored = useMemo(() => (diffConfig(DEFAULT_CONFIG, mergeConfig(cfg)) ?? {}) as Obj, [cfg]);
  const original = useMemo(() => (m ? (diffConfig(DEFAULT_CONFIG, mergeConfig(base, m.config)) ?? {}) : {}), [m, base]);
  const changed = JSON.stringify(stored) !== JSON.stringify(original);
  const set = (patch: Partial<KioskConfig>) => setCfg((c) => mergeConfig(diffConfig(DEFAULT_CONFIG, c), patch));

  const post = () => frame.current?.contentWindow?.postMessage({ type: 'kiosk-preview', config: cfg }, location.origin);
  useEffect(() => { post(); }, [cfg]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.source === frame.current?.contentWindow && e.origin === location.origin && (e.data as { type?: string })?.type === 'kiosk-preview-ready') post(); };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.max(0.12, el.getBoundingClientRect().width / 1920));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [m]);

  if (!parkId || !machines?.length || !m) return null;
  const may = (part: string) => m.allowed.includes(part);
  const live = m.status?.licensed !== false;
  const sales = m.status?.sales_today;

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(URL_FN, { method: 'POST', headers: await headers(), body: JSON.stringify({ park_id: parkId, machine_config_id: m!.id, config: stored }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || t('kio.save_failed'));
      await reload();
      setMsg(t('kio.saved'));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t('kio.save_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function makeCodes() {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(URL_FN, { method: 'POST', headers: await headers(), body: JSON.stringify({ park_id: parkId, machine_config_id: m!.id, action: 'vouchers', kind: vKind, day: vDay, photos: vPhotos, count: vCount }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || t('kio.save_failed'));
      setCodes(body.codes ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t('kio.save_failed'));
    } finally {
      setBusy(false);
    }
  }

  function csv() {
    const what = vKind === 'day' ? `${t('kio.v.day')} ${vDay}` : `${vPhotos} ${t('kio.v.n_photos')}`;
    const blob = new Blob([[`Code;${t('kio.vouchers')}`, ...codes.map((c) => `${c};${what}`)].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `codes-${vKind}-${vDay}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const th = THEMES[cfg.theme.preset] ?? THEMES.clean;
  const setPack = (i: number, p: Partial<Package>) => set({ packages: cfg.packages.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const anyAllowed = m.allowed.length > 0;

  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--line)] px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[color:var(--ink-2)]"><ShoppingCart className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('kio.card_title')}</h3>
          <p className="mt-0.5 text-sm text-[color:var(--ink-3)]">{t('kio.card_sub')}</p>
        </div>
        {machines.length > 1 && (
          <select value={selected} onChange={(e) => setSelected(Number(e.target.value))} className="glass-input w-auto py-1.5 text-sm">
            {machines.map((x, i) => <option key={x.id} value={i}>{x.machine_label || x.machine_id}</option>)}
          </select>
        )}
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${live ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-emerald-500' : 'bg-rose-500'}`} />
          {live ? (m.status?.running === false ? t('kio.off') : t('kio.live')) : t('kio.locked')}
        </span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="bg-slate-50 p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {SCREENS.map((s) => (
              <button key={s} type="button" onClick={() => setScreen(s)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${screen === s ? 'bg-[color:var(--ink)] text-white ring-transparent' : 'bg-white text-[color:var(--ink-2)] ring-[color:var(--line)]'}`}>
                {t(`kio.s.${s}`)}
              </button>
            ))}
          </div>
          <div ref={box} className="w-full">
            <div className="overflow-hidden rounded-xl bg-black shadow-[0_0_0_8px_#1f2933,0_18px_40px_rgba(16,24,40,.3)]" style={{ height: 1080 * scale }}>
              <iframe ref={frame} key={screen} title={t('kio.card_title')} onLoad={post}
                src={`/kiosk/index.html?preview&nopanel&tier=high&screen=${screen}&lang=${screen === 'attract' ? messageLang : cfg.language}`}
                style={{ width: 1920, height: 1080, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0' }} />
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-[color:var(--ink-3)]">{t('kio.preview_note')}</p>
        </div>

        <div className="flex flex-col border-t border-[color:var(--line)] p-5 sm:p-6 lg:border-l lg:border-t-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--ink-3)]">{m.machine_label || m.machine_id}</p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-[11px] text-[color:var(--ink-3)]">{t('kio.sales_today')}</dt><dd className="text-base font-semibold text-[color:var(--ink)]">{sales ? sales.count : '–'}</dd></div>
            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-[11px] text-[color:var(--ink-3)]">{t('kio.revenue_today')}</dt><dd className="text-base font-semibold text-[color:var(--ink)]">{sales ? `${euro(sales.amount_cents)} €` : '–'}</dd></div>
            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-[11px] text-[color:var(--ink-3)]">{t('kio.photos_today')}</dt><dd className="text-base font-semibold text-[color:var(--ink)]">{m.status?.photos ?? '–'}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-[color:var(--ink-3)]">{t('kio.valid_until')}: {m.valid_until ?? t('kio.unlimited')}</p>

          {!anyAllowed && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-[color:var(--ink-2)]">{t('kio.nothing_allowed')}</p>}

          <div className="mt-2">
            {may('prices') && (
              <Section title={t('kio.prices')}>
                {(['print', 'digital', 'combo'] as Format[]).filter((f) => cfg.products[f].enabled).map((f) => (
                  <Price key={f} label={t(`kio.${f}`)} value={cfg.products[f].price} onChange={(c) => set({ products: { ...cfg.products, [f]: { ...cfg.products[f], price: c } } })} />
                ))}
                <p className="pt-1 text-xs text-[color:var(--ink-3)]">{t('kio.packages')}</p>
                {cfg.packages.map((p, i) => (
                  <div key={i} className="flex items-end gap-2 text-sm">
                    <select className="glass-input min-w-0 flex-1 py-1.5" value={p.format} onChange={(e) => setPack(i, { format: e.target.value as Format })}>
                      {(['print', 'digital', 'combo'] as Format[]).map((f) => <option key={f} value={f}>{t(`kio.${f}`)}</option>)}
                    </select>
                    <input className="glass-input w-14 shrink-0 py-1.5" type="number" min={2} max={20} value={p.photos} onChange={(e) => setPack(i, { photos: Math.max(2, Number(e.target.value) || 2) })} />
                    <div className="w-24 shrink-0"><Price label="" value={p.price} onChange={(c) => setPack(i, { price: c })} /></div>
                    <button type="button" className="pb-2 text-rose-600" onClick={() => set({ packages: cfg.packages.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
                {cfg.packages.length < 6 && <button type="button" className="text-sm font-semibold text-[color:var(--accent,#c2410c)]" onClick={() => set({ packages: [...cfg.packages, { format: 'digital', photos: 3, price: 1200 }] })}>{t('kio.add_pack')}</button>}
              </Section>
            )}
            {may('texts') && (
              <Section title={t('kio.texts')}>
                <label className="block text-sm text-[color:var(--ink-3)]">{t('kio.park_name')}<input className="glass-input mt-1 py-1.5" maxLength={60} value={cfg.park_name} onChange={(e) => set({ park_name: e.target.value })} /></label>
                <label className="block text-sm text-[color:var(--ink-3)]">{t('kio.headline')}<input className="glass-input mt-1 py-1.5" maxLength={80} placeholder={t('kio.default_hint')} value={cfg.attract.headline} onChange={(e) => set({ attract: { ...cfg.attract, headline: e.target.value } })} /></label>
                <label className="block text-sm text-[color:var(--ink-3)]">{t('kio.message_language')}
                  <select className="glass-input mt-1 py-1.5" aria-label={t('kio.message_language')} value={messageLang} onChange={(e) => setMessageLang(e.target.value as Lang)}>
                    {LANGS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
                <label className="block text-sm text-[color:var(--ink-3)]">{t('kio.messages')}
                  <textarea className="glass-input mt-1 py-1.5" rows={4} value={cfg.attract.messages[messageLang].join('\n')} onChange={(e) => {
                    const messages = e.target.value.split('\n').slice(0, 30).map((line) => line.slice(0, 500));
                    setCfg((c) => ({ ...c, attract: { ...c.attract, messages: { ...c.attract.messages, [messageLang]: messages } } }));
                  }} />
                </label>
                <label className="block text-sm text-[color:var(--ink-3)]">{t('kio.subline')}<input className="glass-input mt-1 py-1.5" maxLength={120} placeholder={t('kio.default_hint')} value={cfg.attract.subline} onChange={(e) => set({ attract: { ...cfg.attract, subline: e.target.value } })} /></label>
              </Section>
            )}
            {may('design') && (
              <Section title={t('kio.design')}>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(THEMES).map(([id, x]) => (
                    <button key={id} type="button" onClick={() => set({ theme: { ...cfg.theme, preset: id } })}
                      className={`rounded-lg p-1.5 text-left text-xs font-semibold ring-1 ring-inset ${cfg.theme.preset === id ? 'ring-2 ring-[color:var(--accent,#c2410c)]' : 'ring-[color:var(--line)]'}`}>
                      <span className="mb-1 block h-6 rounded" style={{ background: x.bg, borderBottom: `4px solid ${x.brand}` }} />{x.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center justify-between text-sm text-[color:var(--ink-3)]">{t('kio.brand')}
                  <span className="flex items-center gap-2">
                    <input type="color" value={cfg.theme.brand ?? cfg.theme.accent ?? th.brand}
                      onChange={(e) => set({ theme: { ...cfg.theme, brand: e.target.value, accent: null } })} />
                    {(cfg.theme.brand || cfg.theme.accent) && <button type="button" className="text-xs underline"
                      onClick={() => set({ theme: { ...cfg.theme, brand: null, accent: null } })}>{t('kio.reset_color')}</button>}
                  </span>
                </label>
                <label className="block text-sm text-[color:var(--ink-3)]">{t('kio.logo')}<input className="glass-input mt-1 py-1.5" placeholder="https://…" value={cfg.theme.logo ?? ''} onChange={(e) => set({ theme: { ...cfg.theme, logo: e.target.value.trim() || null } })} /></label>
              </Section>
            )}
            {may('languages') && (
              <Section title={t('kio.languages')}>
                <label className="block text-sm text-[color:var(--ink-3)]">{t('kio.start_language')}
                  <select className="glass-input mt-1 py-1.5" value={cfg.language} onChange={(e) => set({ language: e.target.value as Lang })}>
                    {LANGS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
                <div className="flex flex-wrap gap-x-3">
                  {LANGS.map((l) => <Toggle key={l.id} label={l.code} on={cfg.languages.includes(l.id)} onChange={(v) => set({ languages: v ? [...cfg.languages, l.id] : cfg.languages.filter((x) => x !== l.id) })} />)}
                </div>
              </Section>
            )}
            {may('find') && (
              <Section title={t('kio.find')}>
                {(['time', 'number', 'face', 'phone'] as const).map((k) => <Toggle key={k} label={t(`kio.f.${k}`)} on={cfg.find[k]} onChange={(v) => set({ find: { ...cfg.find, [k]: v } })} />)}
              </Section>
            )}
            {may('express') && (
              <Section title={t('kio.rush')}>
                <Toggle label={t('kio.express')} on={cfg.express} onChange={(v) => set({ express: v })} />
              </Section>
            )}
            {may('vouchers') && m.has_vouchers && (
              <Section title={t('kio.vouchers')}>
                <select className="glass-input py-1.5" value={vKind} onChange={(e) => setVKind(e.target.value as 'day' | 'photos')}>
                  <option value="day">{t('kio.v.day')}</option>
                  <option value="photos">{t('kio.v.photos')}</option>
                </select>
                {vKind === 'day'
                  ? <label className="block text-sm text-[color:var(--ink-3)]">{t('kio.v.date')}<input className="glass-input mt-1 py-1.5" type="date" value={vDay} onChange={(e) => setVDay(e.target.value)} /></label>
                  : <label className="block text-sm text-[color:var(--ink-3)]">{t('kio.v.n_photos')}<input className="glass-input mt-1 py-1.5" type="number" min={1} max={9} value={vPhotos} onChange={(e) => setVPhotos(Math.max(1, Math.min(9, Number(e.target.value) || 1)))} /></label>}
                <label className="block text-sm text-[color:var(--ink-3)]">{t('kio.v.count')}<input className="glass-input mt-1 py-1.5" type="number" min={1} max={500} value={vCount} onChange={(e) => setVCount(Number(e.target.value) || 1)} /></label>
                <div className="flex gap-2">
                  <button type="button" className="glass-button py-1.5 text-sm" disabled={busy} onClick={() => void makeCodes()}>{t('kio.v.make')}</button>
                  {codes.length > 0 && <button type="button" className="glass-button py-1.5 text-sm" onClick={csv}>{t('kio.v.csv')}</button>}
                </div>
                {codes.length > 0 && <textarea readOnly className="glass-input font-mono text-xs" rows={Math.min(8, codes.length)} value={codes.join('\n')} />}
              </Section>
            )}
          </div>

          {anyAllowed && (
            <div className="mt-auto pt-4">
              <button type="button" className="glass-button-primary w-full justify-center py-2.5" disabled={busy || !changed} onClick={() => void save()}>
                {busy ? '…' : t('kio.save')}
              </button>
            </div>
          )}
          {msg && <p className="mt-2 text-xs text-[color:var(--ink-3)]" role="status">{msg}</p>}
        </div>
      </div>
    </GlassCard>
  );
}
