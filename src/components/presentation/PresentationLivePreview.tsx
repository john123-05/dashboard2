// Live-Ansicht des Bildschirms am Automaten: dieselbe Seite wie am PC, mit dem Design, das GERADE
// gilt (inkl. aktivem Zeitplan), echten Fotos des Parks und echten QR-Codes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { INHERIT, VIEWER_MARK, loadSamples, mergeDesign, type Design, type Sample } from './PresentationDesigner';

type Plan = { name?: string; from: string; to: string; days?: number[]; design: Design };

/** Wie aktiver_plan() im Agenten: erster passender Zeitplan, sonst der Standard. */
export function activeDesign(design: Design | null, now = new Date()): { design: Design; plan: string | null } {
  const d = design ?? {};
  const { schedule, ...base } = d;
  if (!Array.isArray(schedule)) return { design: base, plan: null };
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  for (const p of (schedule as Plan[]).slice(0, 6)) {
    if (!p?.design || !/^\d\d:\d\d$/.test(p.from) || !/^\d\d:\d\d$/.test(p.to)) continue;
    let day = (now.getDay() + 6) % 7; // Mo = 0
    let inside: boolean;
    if (p.from <= p.to) inside = p.from <= hm && hm < p.to;
    else { inside = hm >= p.from || hm < p.to; if (hm < p.to) day = (day + 6) % 7; }
    if (Array.isArray(p.days) && p.days.length && !p.days.includes(day)) inside = false;
    if (inside) {
      const own: Design = { ...p.design };
      for (const k of INHERIT) if (!(k in own) && k in base) own[k] = base[k];
      return { design: own, plan: p.name || 'schedule' };
    }
  }
  return { design: base, plan: null };
}

export default function PresentationLivePreview({
  design, viewer, defaultLogo, parkSlug, className = '',
}: {
  design: Design | null;
  viewer: Record<string, string> | null;
  defaultLogo: string | null;
  parkSlug?: string | null;
  className?: string;
}) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [now, setNow] = useState(() => new Date());
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(640);

  useEffect(() => { void loadSamples(parkSlug).then(setSamples); }, [parkSlug]);
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(id); }, []);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const { design: current } = useMemo(() => activeDesign(design, now), [design, now]);
  const merged = useMemo(() => mergeDesign(viewer, current), [viewer, current]);
  const portrait = merged.orientation === 90 || merged.orientation === 270;
  const W = portrait ? 1080 : 1920, H = portrait ? 1920 : 1080;
  // Hochkant: nicht breiter als nötig, damit die Karte nicht riesig wird.
  const shownW = portrait ? Math.min(width, 360) : width;
  const scale = shownW / W;

  const state = useMemo(() => {
    const logo = String(current.logo_url || defaultLogo || '') || null;
    const style: Design = { ...merged, logo, viewer_logo: VIEWER_MARK, crop_x: 0, crop_y: 0 };
    delete style.logo_url;
    return { page_rev: 'preview', licensed: true, style, photos: samples.slice(0, 60) };
  }, [merged, samples, current.logo_url, defaultLogo]);
  useEffect(() => {
    const post = () => frame.current?.contentWindow?.postMessage({ type: 'lp-presentation', state }, '*');
    post();
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'lp-presentation-ready') post(); };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [state]);

  return (
    <div ref={box} className={`w-full ${className}`}>
      <div className="mx-auto overflow-hidden rounded-lg bg-black shadow-[0_0_0_6px_#1f2933,0_14px_34px_rgba(16,24,40,.22)]" style={{ width: shownW, height: H * scale }}>
        <iframe
          ref={frame}
          title="Live"
          src="/presentation/index.html?preview=1"
          tabIndex={-1}
          style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0, pointerEvents: 'none' }}
        />
      </div>
    </div>
  );
}
