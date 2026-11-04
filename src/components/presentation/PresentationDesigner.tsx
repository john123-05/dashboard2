// Baukasten für die Liftpictures Presentation (2. Monitor am Automaten) – Kundenansicht.
// Gleiche Logik wie im Liftpictures-CRM (liftpictures-crm: PresentationDesigner.tsx): links die
// Einstellungen, rechts die Live-Vorschau (public/presentation/index.html = dieselbe Seite wie am PC,
// aus testsoftware übernommen) mit echten Fotos des Parks. Gespeichert wird über operator-presentation;
// Freischaltung, Lizenz und QR-Link bleiben bei Liftpictures.
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { X } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { PRESENTATION_FIELDS, PRESENTATION_PRESETS } from './presentationDesignData';
import './presentation-designer.css';

type Field = { kind: string; default: unknown; limits: unknown };
export type Design = Record<string, unknown>;
const FIELDS = PRESENTATION_FIELDS as unknown as Record<string, Field>;

export const INHERIT = ['logo_url', 'header_title', 'header_subtitle', 'ticker_messages', 'qr_caption', 'touch_text', 'empty_text', 'time_format', 'orientation'];
const KEEP_ON_PRESET = ['header_title', 'header_subtitle', 'ticker_messages', 'logo_url', 'qr_caption', 'touch_text', 'empty_text', 'orientation', 'layout', 'columns', 'rows', 'order', 'time_format'];
type Plan = { name?: string; from: string; to: string; days?: number[]; design: Design };

const PRESET_COLORS: Record<string, string[]> = {
  classic: ['#3977BD', '#FFFFFF'], signature: ['#002858', '#FFBE3D'], midnight: ['#0B0F14', '#4EA8FF'], clean: ['#F4F6F8', '#C2410C'],
};
// Optionen mit übersetzten Namen; Schriftnamen und Zeitformate bleiben wörtlich.
const LITERAL_OPTIONS: Record<string, Record<string, string>> = {
  font: { segoe: 'Segoe UI', bahnschrift: 'Bahnschrift', arial: 'Arial', georgia: 'Georgia', trebuchet: 'Trebuchet' },
  time_format: { '24h': '24 h (14:30)', '12h': '12 h (2:30 PM)' },
};

const SECTIONS: { id: string; keys: string[] }[] = [
  { id: 'format', keys: ['orientation', 'layout', 'columns', 'rows', 'order', 'page_seconds', 'max_photos', 'marquee_speed'] },
  { id: 'colors', keys: ['background', 'background2', 'accent', 'font'] },
  { id: 'cards', keys: ['gap', 'padding', 'radius', 'shadow', 'card_background', 'border_width', 'border_color'] },
  { id: 'label', keys: ['label_mode', 'show_number', 'show_time', 'time_format', 'label_size', 'label_color'] },
  { id: 'qr', keys: ['qr_size', 'qr_position', 'qr_caption', 'qr_caption_color'] },
  { id: 'logo', keys: ['logo_url', 'watermark', 'watermark_size', 'watermark_opacity'] },
  { id: 'header', keys: ['header', 'header_subtitle', 'header_title', 'header_height', 'header_background', 'header_color'] },
  { id: 'ticker', keys: ['ticker', 'ticker_messages', 'ticker_position', 'ticker_speed', 'ticker_size', 'ticker_height', 'ticker_background', 'ticker_color'] },
  { id: 'touch', keys: ['new_badge', 'new_minutes', 'new_text', 'touch', 'touch_seconds', 'touch_text', 'empty_text'] },
];

function relevant(key: string, d: Design): boolean {
  if (key === 'page_seconds') return d.layout === 'carousel';
  if (key === 'max_photos') return d.layout === 'carousel' || d.layout === 'marquee';
  if (key === 'marquee_speed') return d.layout === 'marquee';
  if (['show_number', 'show_time', 'time_format', 'label_size', 'label_color'].includes(key)) return d.label_mode !== 'none';
  if (['watermark_size', 'watermark_opacity'].includes(key)) return d.watermark !== 'none';
  if (key.startsWith('header_')) return d.header === true;
  if (key.startsWith('ticker_')) return d.ticker === true;
  if (['new_minutes', 'new_text'].includes(key)) return d.new_badge === true;
  if (['touch_seconds', 'touch_text'].includes(key)) return d.touch === true;
  if (key === 'border_color') return Number(d.border_width) > 0;
  return true;
}

// Grundwerte aus der Settings.xml des Verkaufsprogramms – wie classic_aus_settings im Agenten.
function classicFromViewer(v: Record<string, string> | null): Design {
  const n = (k: string, d: number, lo: number, hi: number) => {
    const x = Number(v?.[k]);
    return Number.isFinite(x) && v?.[k] !== undefined && v[k] !== '' ? Math.max(lo, Math.min(hi, Math.round(x))) : d;
  };
  const c = (k: string, d: string) => (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v?.[k] ?? '') ? String(v![k]).toUpperCase() : d);
  const yes = (k: string, d: boolean) => { const x = (v?.[k] ?? '').toLowerCase(); return x === 'true' ? true : x === 'false' ? false : d; };
  return {
    background: c('SplitBackgroundColor', '#3977BD'), columns: n('SplitNumberColumns', 3, 1, 6), rows: n('SplitNumberRows', 2, 1, 6),
    gap: n('SplitBorder', 20, 0, 200), padding: n('SplitBorder', 20, 0, 200),
    label_mode: yes('SplitShowLabel', true) ? 'below' : 'none', label_size: n('SplitLabelSize', 30, 8, 200), label_color: c('SplitLabelColor', '#FFFFFF'),
    ticker: yes('EnableSplitTicker', true), ticker_messages: [v?.SplitTickerText || 'Scan your photo..!'],
    ticker_color: c('SplitTickerTextColor', '#000000'), ticker_background: c('SplitTickerBackgroundColor', '#FFFFFF'),
    ticker_size: n('SplitTickerTextSize', 40, 8, 300), ticker_height: n('SplitTickerHeight', 40, 8, 400),
    ticker_speed: n('SplitTickerSpeed', 50, 1, 2000) * 2,
  };
}

export function mergeDesign(viewer: Record<string, string> | null, design: Design): Design {
  const out: Design = {};
  for (const [k, f] of Object.entries(FIELDS)) out[k] = f.default;
  Object.assign(out, classicFromViewer(viewer));
  const preset = typeof design.preset === 'string' && PRESENTATION_PRESETS[design.preset] ? design.preset : 'classic';
  Object.assign(out, PRESENTATION_PRESETS[preset]);
  for (const [k, v] of Object.entries(design)) if (k in FIELDS) out[k] = v;
  out.preset = preset;
  if (!Array.isArray(out.ticker_messages) || !(out.ticker_messages as unknown[]).length) out.ticker = false;
  return out;
}

export type Sample = { key: string; src: string; number: string; ts: number; url: string; qr?: string };
const PLACEHOLDER = (i: number) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#${['5b7c99', '7a6a58', '4f6b5a', '6b5b7a'][i % 4]}"/><stop offset="1" stop-color="#1f2933"/></linearGradient></defs><rect width="1500" height="1000" fill="url(#g)"/></svg>`);
export const VIEWER_MARK = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="#ff7a1a" stroke-width="10"/><path d="M22 78 78 22" stroke="#ff7a1a" stroke-width="10"/></svg>');

function numberFromCode(code: string): string {
  return code.length === 16 ? code[10] + code[5] + code[2] + code[15] : code.slice(-4);
}

export async function loadSamples(parkSlug?: string | null): Promise<Sample[]> {
  let list: Sample[] = [];
  if (parkSlug) {
    try {
      const res = await fetch('https://kvpcwlcfgmsmarjtwpsx.supabase.co/functions/v1/online-photo-sales/gallery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: parkSlug }),
      });
      if (res.ok) {
        const data = await res.json();
        list = (data.photos ?? []).map((p: { code: string; preview_url: string; claim_url: string; captured_at: string }) => ({
          key: p.code, src: p.preview_url, number: numberFromCode(p.code), ts: Math.floor(Date.parse(p.captured_at) / 1000), url: p.claim_url,
        }));
      }
    } catch { /* Platzhalter */ }
  }
  const now = Math.floor(Date.now() / 1000);
  for (let i = list.length; i < 12; i++) {
    const code = `44560061710021${String(30 + i).padStart(2, '0')}`;
    list.push({ key: `sample-${i}`, src: PLACEHOLDER(i), number: numberFromCode(code), ts: now - i * 300 - 60,
      url: `https://liftpictures-fotos.de/${parkSlug || 'park'}/claim?code=${code}` });
  }
  await Promise.all(list.map(async (p) => { p.qr = await QRCode.toString(p.url, { type: 'svg', margin: 2, errorCorrectionLevel: 'L' }); }));
  return list;
}

function Control({ k, value, onChange }: { k: string; value: unknown; onChange: (v: unknown) => void }) {
  const { t } = useI18n();
  const f = FIELDS[k];
  const label = t(`pres.f.${k}`);
  if (f.kind === 'ja') {
    return <label className="pd-check"><input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} /> {label}</label>;
  }
  if (f.kind === 'wahl') {
    const opts = (f.limits as (string | number)[]).map(String);
    return (
      <label className="pd-field">{label}
        <select value={String(value)} onChange={(e) => onChange(typeof f.default === 'number' ? Number(e.target.value) : e.target.value)}>
          {opts.map((o) => <option key={o} value={o}>{LITERAL_OPTIONS[k]?.[o] ?? t(`pres.o.${k}.${o}`)}</option>)}
        </select>
      </label>
    );
  }
  if (f.kind === 'zahl') {
    const [lo, hi] = f.limits as [number, number];
    return (
      <label className="pd-field"><span>{label} <b>{String(value)}</b></span>
        <input type="range" min={lo} max={hi} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} />
      </label>
    );
  }
  if (f.kind === 'farbe' || f.kind === 'farbe_leer') {
    const empty = value === '' || value === undefined;
    return (
      <label className="pd-field">{label}
        <span className="pd-color">
          <input type="color" value={empty ? '#000000' : String(value).slice(0, 7)} onChange={(e) => onChange(e.target.value.toUpperCase())} />
          <code>{empty ? t('pres.none') : String(value)}</code>
          {f.kind === 'farbe_leer' && !empty && <button type="button" onClick={() => onChange('')}>{t('pres.none')}</button>}
        </span>
      </label>
    );
  }
  if (f.kind === 'liste') {
    return (
      <label className="pd-field">{label}
        <textarea rows={4} value={(Array.isArray(value) ? value : []).join('\n')}
          onChange={(e) => onChange(e.target.value.split('\n').map((x) => x.slice(0, 140)).slice(0, 8))} />
      </label>
    );
  }
  return (
    <label className="pd-field">{label}
      <input value={String(value ?? '')} maxLength={f.kind === 'url' ? 400 : Number(f.limits) || 120} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export default function PresentationDesigner({
  title, initial, viewer, defaultLogo, parkSlug, onClose, onSave,
}: {
  title: string;
  initial: Design | null;
  viewer: Record<string, string> | null;
  defaultLogo: string | null;
  parkSlug?: string | null;
  onClose: () => void;
  onSave: (design: Design) => Promise<void>;
}) {
  const { t } = useI18n();
  const [design, setDesign] = useState<Design>(() => (initial && typeof initial === 'object' ? { ...initial } : { preset: 'classic' }));
  const [tab, setTab] = useState(-1);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  const plans = (Array.isArray(design.schedule) ? design.schedule : []) as Plan[];
  const base: Design = useMemo(() => { const { schedule: _s, ...rest } = design; void _s; return rest; }, [design]);
  const effective: Design = useMemo(() => {
    if (tab < 0 || !plans[tab]) return base;
    const own = { ...plans[tab].design };
    for (const k of INHERIT) if (!(k in own) && k in base) own[k] = base[k];
    return own;
  }, [tab, plans, base]);
  const merged = useMemo(() => mergeDesign(viewer, effective), [viewer, effective]);
  const portrait = merged.orientation === 90 || merged.orientation === 270;
  const W = portrait ? 1080 : 1920, H = portrait ? 1920 : 1080;
  const days = t('pres.days').split(',');

  useEffect(() => { void loadSamples(parkSlug).then(setSamples); }, [parkSlug]);
  useEffect(() => {
    const fit = () => { const el = box.current; if (el) setScale(Math.min(el.clientWidth / W, (el.clientHeight - 40) / H)); };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [W, H]);

  const state = useMemo(() => {
    const logo = String(effective.logo_url || defaultLogo || '') || null;
    const style: Design = { ...merged, logo, viewer_logo: VIEWER_MARK, crop_x: 0, crop_y: 0 };
    delete style.logo_url;
    return { page_rev: 'preview', licensed: true, style, photos: samples.slice(0, 60) };
  }, [merged, samples, effective.logo_url, defaultLogo]);
  useEffect(() => {
    const post = () => frame.current?.contentWindow?.postMessage({ type: 'lp-presentation', state }, '*');
    post();
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'lp-presentation-ready') post(); };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [state]);

  function updateCurrent(fn: (d: Design) => Design) {
    setMsg('');
    setDesign((d) => {
      if (tab < 0) { const { schedule, ...rest } = d; const next = fn(rest); return schedule ? { ...next, schedule } : next; }
      const list = [...((d.schedule as Plan[]) ?? [])];
      if (!list[tab]) return d;
      list[tab] = { ...list[tab], design: fn(list[tab].design) };
      return { ...d, schedule: list };
    });
  }
  const set = (k: string, v: unknown) => updateCurrent((d) => ({ ...d, [k]: v }));
  const choosePreset = (p: string) => updateCurrent((d) => {
    const keep: Design = { preset: p };
    for (const k of KEEP_ON_PRESET) if (k in d) keep[k] = d[k];
    return keep;
  });
  function updatePlan(patch: Partial<Plan>) {
    setMsg('');
    setDesign((d) => { const list = [...((d.schedule as Plan[]) ?? [])]; list[tab] = { ...list[tab], ...patch }; return { ...d, schedule: list }; });
  }
  function addPlan() {
    if (plans.length >= 6) return;
    setDesign((d) => ({ ...d, schedule: [...((d.schedule as Plan[]) ?? []), { name: t('pres.default_plan_name'), from: '18:00', to: '23:00', days: [], design: { preset: 'midnight' } }] }));
    setTab(plans.length);
  }
  function removePlan() {
    setDesign((d) => {
      const list = [...((d.schedule as Plan[]) ?? [])];
      list.splice(tab, 1);
      const { schedule: _s, ...rest } = d; void _s;
      return list.length ? { ...rest, schedule: list } : rest;
    });
    setTab(-1);
  }

  async function save() {
    setBusy(true); setMsg('');
    try {
      const tidy = (src: Design) => {
        const out: Design = {};
        for (const [k, v] of Object.entries(src)) {
          if (!(k in FIELDS)) continue;
          out[k] = k === 'ticker_messages' && Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : v;
        }
        return out;
      };
      const clean: Design = tidy(base);
      if (plans.length) clean.schedule = plans.map((p) => ({ name: (p.name ?? '').slice(0, 40), from: p.from, to: p.to, days: p.days ?? [], design: tidy(p.design) }));
      await onSave(clean);
      setMsg(t('pres.saved'));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t('pres.save_failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pd" role="dialog" aria-modal="true" aria-label={t('pres.designer_title')}>
      <div className="pd-bar">
        <b>{t('pres.designer_title')} · {title}</b>
        <span>{msg}</span>
        <button type="button" className="pd-save" disabled={busy} onClick={() => void save()}>{busy ? t('pres.saving') : t('pres.save')}</button>
        <button type="button" className="pd-close" onClick={onClose} aria-label={t('pres.close')}><X size={18} /></button>
      </div>
      <div className="pd-body">
        <aside className="pd-side">
          <div className="pd-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab < 0} className={tab < 0 ? 'on' : ''} onClick={() => setTab(-1)}>{t('pres.tab_standard')}</button>
            {plans.map((p, i) => (
              <button key={i} type="button" role="tab" aria-selected={tab === i} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>
                {p.name || t('pres.tab_schedule', { n: i + 1 })} <small>{p.from}–{p.to}</small>
              </button>
            ))}
            {plans.length < 6 && <button type="button" className="add" onClick={addPlan}>{t('pres.add_schedule')}</button>}
          </div>
          {tab >= 0 && plans[tab] && (
            <section>
              <h5>{t('pres.schedule')}</h5>
              <label className="pd-field">{t('pres.name')}<input value={plans[tab].name ?? ''} maxLength={40} onChange={(e) => updatePlan({ name: e.target.value })} /></label>
              <div className="pd-times">
                <label className="pd-field">{t('pres.from')}<input type="time" value={plans[tab].from} onChange={(e) => updatePlan({ from: e.target.value })} /></label>
                <label className="pd-field">{t('pres.to')}<input type="time" value={plans[tab].to} onChange={(e) => updatePlan({ to: e.target.value })} /></label>
              </div>
              <div className="pd-days">
                {days.map((d, i) => {
                  const on = (plans[tab].days ?? []).includes(i);
                  return <button key={i} type="button" className={on ? 'on' : ''} onClick={() => updatePlan({ days: on ? (plans[tab].days ?? []).filter((x) => x !== i) : [...(plans[tab].days ?? []), i].sort() })}>{d}</button>;
                })}
              </div>
              <p className="pd-hint">{t('pres.days_hint')}</p>
              <button type="button" className="pd-remove" onClick={removePlan}>{t('pres.remove_schedule')}</button>
            </section>
          )}
          <section>
            <h5>{t('pres.template')}</h5>
            <div className="pd-presets">
              {Object.keys(PRESET_COLORS).map((id) => (
                <button key={id} type="button" className={merged.preset === id ? 'on' : ''} onClick={() => choosePreset(id)}>
                  <span className="sw" style={{ background: `linear-gradient(135deg, ${PRESET_COLORS[id][0]} 60%, ${PRESET_COLORS[id][1]} 60%)` }} />
                  <b>{t(`pres.p.${id}.title`)}</b><small>{t(`pres.p.${id}.text`)}</small>
                </button>
              ))}
            </div>
          </section>
          {SECTIONS.map((s) => (
            <section key={s.id}>
              <h5>{t(`pres.s.${s.id}`)}</h5>
              {s.keys.filter((k) => relevant(k, merged)).map((k) => <Control key={k} k={k} value={merged[k]} onChange={(v) => set(k, v)} />)}
            </section>
          ))}
          <p className="pd-hint">{t('pres.tips')}</p>
        </aside>
        <div className="pd-preview" ref={box}>
          <div style={{ width: W * scale, height: H * scale }} className="pd-screen">
            <iframe ref={frame} title={t('pres.designer_title')} src="/presentation/index.html?preview=1"
              style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0 }} />
          </div>
          <p className="pd-hint">{t('pres.preview_note')}{samples.length && samples[0].key.startsWith('sample') ? t('pres.preview_samples') : ''}</p>
        </div>
      </div>
    </div>
  );
}
