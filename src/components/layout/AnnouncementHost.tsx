import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import QRCode from '../../lib/vendor/qrcode.bundle.js';
import { useAuth } from '../../contexts/AuthContext';
import { usePark } from '../../contexts/ParkContext';
import { useI18n } from '../../lib/i18n';
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '../../lib/supabase';
import { getFunctionSession } from '../../lib/functionAuth';
import { pageKeyForPath } from '../../lib/permissions';

// Hinweise aus dem Liftpictures-CRM (docs/AUSBAU_PLAN.md, HW2): eine kleine Karte in einer Ecke, je Seite
// gezielt. Einmal geschlossen = für diesen Nutzer weg. Es ist immer höchstens ein Hinweis sichtbar.

type Announcement = {
  id: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_url: string | null;
  qr_url: string | null;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
  pages: string[];
  audience: 'all' | 'owner' | 'staff';
  tone: 'info' | 'offer' | 'warning';
};

const ENDPOINT = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-announcements`;

async function headers(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await getFunctionSession();
  if (!session?.access_token) return null;
  return { Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY };
}

const TONE_BAR: Record<Announcement['tone'], string> = {
  info: 'bg-[color:var(--ink)]',
  offer: 'bg-brand-600',
  warning: 'bg-amber-500',
};

export default function AnnouncementHost({ sidebarWidth }: { sidebarWidth: number }) {
  const { t } = useI18n();
  const { parkId } = usePark();
  const { isOwner, isStaff } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState<Announcement[]>([]);
  const [closed, setClosed] = useState<string[]>([]);
  const [qr, setQr] = useState<{ id: string; src: string } | null>(null);

  useEffect(() => {
    if (!parkId) return;
    let active = true;
    async function load() {
      try {
        const h = await headers();
        if (!h) return;
        const res = await fetch(`${ENDPOINT}?park_id=${encodeURIComponent(parkId!)}`, { headers: h });
        const body = await res.json().catch(() => null);
        if (active && res.ok) setItems((body?.data?.announcements ?? []) as Announcement[]);
      } catch {
        // Hinweise sind Beiwerk: bei einem Fehler bleibt die Seite einfach ohne.
      }
    }
    void load();
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void load(), 10 * 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [parkId]);

  const pageKey = pathname.startsWith('/ratgeber') ? 'ratgeber' : pageKeyForPath(pathname);
  const current = useMemo(
    () =>
      items.find(
        (a) =>
          !closed.includes(a.id) &&
          (a.pages.length === 0 || (pageKey !== null && a.pages.includes(pageKey))) &&
          (a.audience === 'all' || (a.audience === 'owner' ? isOwner : isStaff)),
      ) ?? null,
    [items, closed, pageKey, isOwner, isStaff],
  );

  function report(id: string, event: 'seen' | 'clicked' | 'dismissed') {
    if (!parkId) return;
    void headers().then((h) => {
      if (!h) return;
      void fetch(ENDPOINT, {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ park_id: parkId, announcement_id: id, event }),
      }).catch(() => undefined);
    });
  }

  useEffect(() => {
    if (current) report(current.id, 'seen');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    if (!current?.qr_url) {
      setQr(null);
      return;
    }
    let active = true;
    const target = current.qr_url.startsWith('/') ? `${window.location.origin}${current.qr_url}` : current.qr_url;
    QRCode.toDataURL(target, { margin: 1, width: 180 })
      .then((src: string) => active && setQr({ id: current.id, src }))
      .catch(() => active && setQr(null));
    return () => {
      active = false;
    };
  }, [current?.id, current?.qr_url]);

  if (!current) return null;

  function dismiss() {
    if (!current) return;
    setClosed((list) => [...list, current.id]);
    report(current.id, 'dismissed');
  }

  function follow() {
    if (!current?.cta_url) return;
    report(current.id, 'clicked');
    if (current.cta_url.startsWith('/')) navigate(current.cta_url);
    else window.open(current.cta_url, '_blank', 'noopener');
  }

  const position = current.position;
  const top = position.startsWith('top');
  const left = position.endsWith('left');
  // Handy: volle Breite über der unteren bzw. unter der oberen Leiste. Desktop: in der gewählten Ecke.
  const placement =
    position === 'center'
      ? 'inset-0 flex items-center justify-center bg-slate-900/30 p-4'
      : `inset-x-3 ${top ? 'top-14' : 'bottom-[calc(76px+env(safe-area-inset-bottom,0px))]'} min-[901px]:inset-x-auto ${
          top ? 'min-[901px]:top-16' : 'min-[901px]:bottom-6'
        } ${left ? 'min-[901px]:left-0' : 'min-[901px]:right-6'}`;

  return (
    <div className={`fixed z-[60] ${placement}`} role="status" aria-label={t('ann.label')}>
      <div
        className={`relative w-full overflow-hidden rounded-xl border border-[color:var(--line)] bg-white shadow-[0_16px_40px_rgba(16,24,40,0.18)] min-[901px]:w-[360px] ${
          position !== 'center' && left ? 'min-[901px]:ml-[var(--ann-left)]' : ''
        }`}
        style={{ ['--ann-left' as string]: `calc(${sidebarWidth}px + 1.5rem)` }}
      >
        <div className={`h-1 ${TONE_BAR[current.tone]}`} />
        <div className="flex gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="pr-6 text-sm font-semibold text-[color:var(--ink)]">{current.title}</p>
            {current.body && <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[color:var(--ink-2)]">{current.body}</p>}
            {current.cta_label && current.cta_url && (
              <button type="button" onClick={follow} className="glass-button-primary mt-3">
                {current.cta_label}
              </button>
            )}
          </div>
          {qr?.id === current.id && (
            <div className="hidden shrink-0 text-center sm:block">
              <img src={qr.src} alt="" className="h-24 w-24 rounded border border-[color:var(--line)]" />
              <p className="mt-1 w-24 text-[11px] leading-tight text-[color:var(--ink-3)]">{t('ann.scan')}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('nav.close')}
          title={t('nav.close')}
          className="absolute right-2 top-3 rounded-full p-1.5 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
