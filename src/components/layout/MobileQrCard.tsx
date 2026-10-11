import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Minus, Smartphone, X } from 'lucide-react';
import QRCode from '../../lib/vendor/qrcode.bundle.js';
import { useI18n } from '../../lib/i18n';

// Karte unten rechts am großen Bildschirm (HubSpot-Muster „Mobile App holen“): QR-Code scannen, auf dem Handy
// anmelden. Lässt sich verkleinern (kleiner Knopf bleibt) oder ganz ausblenden; über das Hilfe-Center oder
// „Erste Schritte“ wieder zu öffnen (`lp:show-mobile-qr`). Nur ab 901 px Breite, nie im Rundgang.
const KEY = 'lp-mobile-qr';
type State = 'open' | 'small' | 'hidden';

function readState(): State {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'small' || value === 'hidden' ? value : 'open';
  } catch {
    return 'open';
  }
}

export default function MobileQrCard() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [state, setState] = useState<State>(readState);
  const [forced, setForced] = useState(false);
  // Die große Karte zeigt sich von selbst nur auf der Übersicht und bei „Erste Schritte“. Auf Seiten mit fester
  // Leiste unten (Shop bearbeiten, Kamera) bleibt die Ecke ganz frei, sonst steht nur der kleine Knopf da.
  const blocked = pathname === '/shop/bearbeiten' || pathname === '/kamera';
  const roomy = pathname === '/' || pathname === '/start';
  const [qr, setQr] = useState<string | null>(null);

  function update(next: State) {
    setState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // ohne Speicher gilt die Wahl nur für diese Sitzung
    }
  }

  useEffect(() => {
    const show = () => { setForced(true); update('open'); };
    window.addEventListener('lp:show-mobile-qr', show);
    return () => window.removeEventListener('lp:show-mobile-qr', show);
  }, []);

  useEffect(() => {
    if (qr) return;
    let active = true;
    QRCode.toDataURL(`${window.location.origin}/login`, { margin: 1, width: 220 })
      .then((src: string) => active && setQr(src))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [state, qr]);

  if (state === 'hidden' || blocked) return null;

  if (state === 'small' || (!roomy && !forced)) {
    return (
      <button
        type="button"
        onClick={() => { setForced(true); update('open'); }}
        className="lp-corner-card fixed bottom-4 right-4 z-[60] hidden items-center gap-2 rounded-full border border-[color:var(--line-strong)] bg-white px-4 py-2.5 text-sm font-medium text-[color:var(--ink)] shadow-[0_8px_24px_rgba(16,24,40,0.14)] hover:bg-slate-50 min-[901px]:inline-flex"
      >
        <Smartphone className="h-4 w-4 text-brand-700" />
        {t('qr.open')}
      </button>
    );
  }

  return (
    <aside
      aria-label={t('qr.title')}
      className="lp-corner-card fixed bottom-4 right-4 z-[60] hidden w-[300px] rounded-xl border border-[color:var(--line-strong)] bg-white p-4 shadow-[0_16px_48px_rgba(16,24,40,0.18)] min-[901px]:block"
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-[color:var(--ink)]">{t('qr.title')}</p>
        <button type="button" onClick={() => { setForced(false); update('small'); }} aria-label={t('qr.minimize')} title={t('qr.minimize')} className="rounded-md p-1 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]">
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => update('hidden')} aria-label={t('qr.close')} title={t('qr.close')} className="rounded-md p-1 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex h-[104px] w-[104px] shrink-0 items-center justify-center rounded-lg border border-[color:var(--line)] bg-white p-1.5">
          {qr ? <img src={qr} alt="" className="h-full w-full" /> : <Smartphone className="h-6 w-6 text-slate-300" />}
        </div>
        <p className="text-xs leading-relaxed text-[color:var(--ink-2)]">{t('qr.text')}</p>
      </div>
      <Link to="/start#app" className="mt-3 inline-block text-xs font-semibold text-brand-700 hover:underline">
        {t('qr.how')}
      </Link>
    </aside>
  );
}
