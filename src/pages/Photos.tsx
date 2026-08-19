import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, ShoppingBag, Eye, Clock, RefreshCw, Search, CalendarClock, ChevronLeft, ChevronRight, X, RotateCw } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { getOptionalSourceWarning, invokeEdgeFunction, isEdgeSourceUnavailable } from '../lib/edgeFunctions';
import { formatNumber, formatPercent, formatRelative, formatDateTime } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import KPICard from '../components/ui/KPICard';
import { useI18n } from '../lib/i18n';
import { usePark } from '../contexts/ParkContext';
import { useAuth } from '../contexts/AuthContext';
import { fetchRecentPhotos, searchPhotosByCode, searchPhotosByDateTime, claimLinkFor, type BrowsablePhoto } from '../lib/photoBrowser';
import { fetchKioskSales, fetchKioskPhotosForDay, aggregateByDate, todayInTimezone, type AggregatedDay } from '../lib/kioskSales';
import { supabase, EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '../lib/supabase';

const ASSETS_URL = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-liftpic-assets`;

/**
 * Ein Automat, soweit diese Seite ihn braucht.
 *
 * `can_test_photo` und `restartable` sagt der Automat SELBST im Herzschlag -
 * das Dashboard raet nicht. Ein Automat ohne eingerichtete Kamerasoftware
 * meldet eine leere Liste und bekommt hier keinen Knopf, statt einen zu
 * zeigen, der ins Leere greift.
 */
type Automat = {
  id: string;
  machine_id: string;
  machine_label?: string | null;
  can_test_photo?: boolean;
  restartable?: { key: string; name: string; tech: string; folge: string }[];
};

// Local "YYYY-MM-DDTHH:MM" for a datetime-local input, defaulted to now so
// staff can just tweak the time (date is today by default).
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface AttractionPhotoStats {
  name: string;
  total: number;
  purchased: number;
  available: number;
  expired: number;
}

const CHART_COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#94a3b8'];

function qrImageUrlFor(value: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=168x168&margin=12&data=${encodeURIComponent(value)}`;
}

export default function Photos({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useI18n();
  const { parkId, isKioskPark, parkName, kioskTimezone } = usePark();
  // Staff must not see purchase/conversion numbers (sales data).
  const { isStaff } = useAuth();
  const [stats, setStats] = useState({ total: 0, purchased: 0, available: 0, expired: 0 });
  // Kiosk-only: the daily rollups + the day the donuts/KPIs currently show
  // (defaults to today, navigable back). soldLifetime is the full total.
  const [kioskConv, setKioskConv] = useState<{ sold: number; taken: number; soldLifetime: number } | null>(null);
  const [kioskDays, setKioskDays] = useState<AggregatedDay[]>([]);
  const [soldLifetime, setSoldLifetime] = useState(0);
  const [attrName, setAttrName] = useState('Automat');
  const [selectedDate, setSelectedDate] = useState('');
  // Kiosk-only: of the day's buyers, how many left an email (E-Mail-Erfassung).
  const [emailDay, setEmailDay] = useState<{ given: number; total: number } | null>(null);
  const [attractionStats, setAttractionStats] = useState<AttractionPhotoStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [browsePhotos, setBrowsePhotos] = useState<BrowsablePhoto[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [activeSearch, setActiveSearch] = useState<'recent' | 'code' | 'datetime'>('recent');
  const [codeQuery, setCodeQuery] = useState('');
  const [dateTimeQuery, setDateTimeQuery] = useState(() => toLocalInput(new Date()));
  const [selectedPhoto, setSelectedPhoto] = useState<BrowsablePhoto | null>(null);
  const [copiedLink, setCopiedLink] = useState<'claim' | 'image' | null>(null);
  const selectedPhotoCardRef = useRef<HTMLDivElement | null>(null);

  // Automaten dieses Parks, nur fuer die zwei Knoepfe neben "Aktualisieren".
  const [automaten, setAutomaten] = useState<Automat[]>([]);
  const [automatBusy, setAutomatBusy] = useState<string | null>(null);

  async function operatorKopfzeilen() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    return { Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY };
  }

  /**
   * Die Automaten holen, damit die Knoepfe wissen, ob sie ueberhaupt etwas
   * bewirken koennen.
   *
   * Scheitert das, bleibt die Liste leer und es erscheint kein Knopf - eine
   * Fehlermeldung waere hier falsch, die Fotoseite funktioniert ja weiter.
   */
  async function automatenLaden() {
    if (!parkId) { setAutomaten([]); return; }
    const h = await operatorKopfzeilen();
    if (!h) return;
    try {
      const res = await fetch(`${ASSETS_URL}?park_id=${encodeURIComponent(parkId)}`, { headers: h });
      if (!res.ok) return;
      const body = await res.json().catch(() => null);
      setAutomaten((body?.data?.machines || []) as Automat[]);
    } catch {
      /* die Fotoseite laeuft auch ohne */
    }
  }

  /**
   * Einen Auftrag an den Automaten schicken - Testfoto oder Kamera-Neustart.
   *
   * Beides reist ueber denselben, bereits abgesicherten und quittierten Weg wie
   * die Knoepfe im Systemzustand. Das Ergebnis erscheint dort im Verlauf, denn
   * erst der Automat weiss, ob wirklich ein Bild entstanden ist: der Ausloeser
   * meldet auch dann Erfolg, wenn die Kamera gar nicht reagiert hat.
   */
  async function automatAuftrag(automat: Automat, ziel: 'testphoto' | 'camera') {
    const frage = ziel === 'testphoto'
      ? 'Der Automat nimmt jetzt ein Foto auf und schickt es durch die ganze Kette.\n\nFortfahren?'
      : 'Die Kamera-Software wird beendet und neu gestartet.\n\n'
        + 'Waehrenddessen entstehen fuer einige Sekunden keine Fotos. Nur ausfuehren, '
        + 'wenn gerade niemand faehrt.\n\nFortfahren?';
    if (!confirm(frage)) return;

    setAutomatBusy(`${automat.id}:${ziel}`);
    setBrowseError(null);
    const h = await operatorKopfzeilen();
    if (!h) { setBrowseError('Deine Sitzung ist abgelaufen. Bitte melde dich neu an.'); setAutomatBusy(null); return; }

    try {
      const res = await fetch(ASSETS_URL, {
        method: 'PATCH',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ park_id: parkId, machine_config_id: automat.id, mode: 'now', target: ziel }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setBrowseError(body?.error || `HTTP ${res.status}`);
      } else {
        setNotice(ziel === 'testphoto'
          ? 'Testfoto beauftragt. Es dauert bis zu einer Minute, bis es hier erscheint - dann auf "Aktualisieren" tippen. Das Ergebnis steht im Systemzustand, auch wenn kein Bild zustande kam.'
          : 'Neustart der Kamera-Software beauftragt. Das Ergebnis steht gleich im Systemzustand im Verlauf - auch ein Fehlschlag.');
      }
    } catch (e) {
      setBrowseError(e instanceof Error ? e.message : 'Auftrag fehlgeschlagen.');
    }
    setAutomatBusy(null);
  }

  async function copyLink(kind: 'claim' | 'image', url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Link kopieren:', url);
    }
    setCopiedLink(kind);
    setTimeout(() => setCopiedLink((k) => (k === kind ? null : k)), 2000);
  }

  useEffect(() => {
    loadData();
  }, [parkId, isKioskPark, isStaff]);

  // Default the day picker to today (park timezone) once we know the timezone.
  useEffect(() => {
    if (!isKioskPark || selectedDate) return;
    setSelectedDate(todayInTimezone(kioskTimezone));
  }, [isKioskPark, kioskTimezone, selectedDate]);

  // Kiosk: derive the selected day's KPIs + donuts from the daily rollups, so
  // navigating the date updates everything (defaults to today).
  useEffect(() => {
    if (!isKioskPark || isStaff) return;
    const day = kioskDays.find((d) => d.businessDate === selectedDate);
    const taken = day?.expectedCount ?? 0;
    const sold = day?.soldCount ?? 0;
    const available = Math.max(0, taken - sold);
    setStats({ total: taken, purchased: sold, available, expired: 0 });
    setKioskConv({ sold, taken, soldLifetime });
    setAttractionStats([{ name: attrName, total: taken, purchased: sold, available, expired: 0 }]);
  }, [isKioskPark, isStaff, kioskDays, selectedDate, soldLifetime, attrName]);

  // Kiosk: how many of the selected day's buyers left an email address. Reads
  // the day's individual purchases (each carries an email field), so it fills
  // automatically once email capture is switched on at the kiosk.
  useEffect(() => {
    if (!isKioskPark || isStaff || !parkId || !selectedDate) {
      setEmailDay(null);
      return;
    }
    let cancelled = false;
    fetchKioskPhotosForDay(parkId, selectedDate)
      .then((res) => {
        if (cancelled) return;
        const purchases = res.purchases ?? [];
        const given = purchases.filter((p) => p.email && p.email.trim()).length;
        setEmailDay({ given, total: purchases.length });
      })
      .catch(() => {
        if (!cancelled) setEmailDay(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isKioskPark, isStaff, parkId, selectedDate]);

  useEffect(() => {
    setSelectedPhoto(null);
    if (parkId) { runBrowse('recent'); void automatenLaden(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkId]);

  useEffect(() => {
    if (!selectedPhoto || typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 1023px)').matches) return;

    selectedPhotoCardRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, [selectedPhoto]);

  const todayStr = isKioskPark ? todayInTimezone(kioskTimezone) : '';
  const selectedDateLabel = selectedDate
    ? new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
        new Date(`${selectedDate}T00:00:00`),
      )
    : '';
  function stepDay(delta: number) {
    if (!selectedDate) return;
    const d = new Date(`${selectedDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    const next = d.toISOString().slice(0, 10);
    if (todayStr && next > todayStr) return;
    setSelectedDate(next);
  }

  async function runBrowse(mode: 'recent' | 'code' | 'datetime', codeValue?: string, dateTimeValue?: string) {
    if (!parkId) return;
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      let results: BrowsablePhoto[] = [];
      if (mode === 'code') {
        results = await searchPhotosByCode(parkId, codeValue ?? codeQuery);
      } else if (mode === 'datetime') {
        results = await searchPhotosByDateTime(parkId, dateTimeValue ?? dateTimeQuery);
      } else {
        results = await fetchRecentPhotos(parkId);
      }
      setBrowsePhotos(results);
      setActiveSearch(mode);
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : 'Unbekannter Fehler beim Laden der Fotos.');
    } finally {
      setBrowseLoading(false);
    }
  }

  function handleCodeSearch(e: FormEvent) {
    e.preventDefault();
    setSelectedPhoto(null);
    runBrowse('code');
  }

  function handleDateTimeSearch(e: FormEvent) {
    e.preventDefault();
    setSelectedPhoto(null);
    runBrowse('datetime');
  }

  function handleClearSearch() {
    setCodeQuery('');
    setDateTimeQuery('');
    setSelectedPhoto(null);
    runBrowse('recent');
  }

  function handleRefreshBrowse() {
    setSelectedPhoto(null);
    runBrowse(activeSearch);
  }

  function renderSelectedPhotoCard() {
    if (!selectedPhoto) {
      return (
        <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl bg-white/20 p-6 text-center text-sm text-slate-400">
          Foto auswählen, um es hier groß anzuzeigen.
        </div>
      );
    }

    const claimLink = claimLinkFor(parkId, selectedPhoto.externalCode);
    const imageLink = selectedPhoto.imageUrl;

    return (
      <div ref={selectedPhotoCardRef} className="rounded-xl bg-white/30 p-3 sm:p-4">
        {selectedPhoto.imageUrl && (
          <img
            src={selectedPhoto.imageUrl}
            alt="Ausgewähltes Foto"
            className="w-full rounded-lg object-cover"
          />
        )}
        <p className="mt-3 text-center text-sm font-semibold text-slate-800">
          {selectedPhoto.externalCode || selectedPhoto.id}
        </p>
        <p className="mt-1 text-center text-xs text-slate-500">{formatDateTime(selectedPhoto.capturedAt)}</p>
        {selectedPhoto.isTest && (
          <p className="mt-1 text-center text-xs font-medium text-amber-700">
            Testfoto &ndash; zählt nicht als Verkauf
          </p>
        )}
        {selectedPhoto.speedKmh !== null && (
          <p className="mt-1 text-center text-xs font-medium text-sky-600">
            {selectedPhoto.speedKmh.toFixed(1)} km/h
          </p>
        )}

        <div className="mt-4 space-y-2">
          {claimLink && (
            <button
              onClick={() => copyLink('claim', claimLink)}
              className="glass-button-primary flex w-full items-center justify-center gap-1.5 text-sm"
            >
              {copiedLink === 'claim' ? 'Kopiert!' : 'Claim-Link kopieren'}
            </button>
          )}
          {imageLink && (
            <button
              onClick={() => copyLink('image', imageLink)}
              className="glass-button-secondary flex w-full items-center justify-center gap-1.5 text-sm"
            >
              {copiedLink === 'image' ? 'Kopiert!' : 'Bild-Link kopieren'}
            </button>
          )}
        </div>

        {claimLink && (
          <div className="mt-4 rounded-2xl border border-slate-200/70 bg-white/70 p-3 sm:p-4">
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <img
                  src={qrImageUrlFor(claimLink)}
                  alt="QR-Code zum Claim-Link"
                  className="h-[168px] w-[168px] max-w-full"
                  loading="lazy"
                />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm font-semibold text-slate-800">QR-Code für dieses Foto</p>
                <p className="text-xs leading-relaxed text-slate-500">
                  Der Gast scannt den Code und landet direkt auf der passenden Claim-Seite mit dem korrekten Bildcode.
                </p>
                {selectedPhoto.externalCode && (
                  <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">
                    Code {selectedPhoto.externalCode}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
          Claim-Link: der Kunde öffnet ihn und holt sein Foto per E-Mail, auch wenn der gedruckte QR vorher nicht
          funktioniert hat. Bild-Link: direkter Download.
        </p>
      </div>
    );
  }

  async function loadData() {
    setLoading(true);
    setError(null);

    // Kiosk parks: the generic external-photos feed is capped at 1000 rows and
    // never marks kiosk sales as "purchased", so it showed 1000/0/0%. Use the
    // permanent sales + ride rollups instead (same source as Übersicht/Umsatz).
    if (isKioskPark && parkId && !isStaff) {
      try {
        const kiosk = await fetchKioskSales(parkId);
        const days = aggregateByDate(kiosk.days, kiosk.priceCents ?? 0);
        setKioskDays(days);
        setSoldLifetime(days.reduce((sum, d) => sum + d.soldCount, 0));

        let name = parkName || 'Automat';
        const attrRes = await invokeEdgeFunction<{ attractions: { name: string; is_active?: boolean }[] }>(
          'external-attractions',
          { query: { park_id: parkId } },
        );
        const activeAttr = (attrRes.data?.attractions || []).find((a) => a.is_active !== false);
        if (activeAttr?.name) name = activeAttr.name;
        setAttrName(name);

        setNotice(null);
        setError(null);
        setLoading(false);
        return;
      } catch (err) {
        console.error('Failed to load kiosk photo stats:', err);
        // fall through to the generic photo feed below
      }
    }

    setKioskConv(null);
    const { data, error: invokeError } = await invokeEdgeFunction('external-photos', {
      query: { park_id: parkId || undefined },
    });

    if (invokeError) {
      console.error('Failed to fetch external photos:', invokeError);
      if (isEdgeSourceUnavailable(invokeError)) {
        setStats({ total: 0, purchased: 0, available: 0, expired: 0 });
        setAttractionStats([]);
        setNotice(getOptionalSourceWarning('Photo feed', invokeError));
        setError(null);
        setLoading(false);
        return;
      }
      setError(invokeError);
      setLoading(false);
      return;
    }

    const photos = (data?.photos || []) as Array<{ id: string; status: string; attraction_id: string | null }>;
    const attractions = (data?.attractions || []) as Array<{ id: string; name: string }>;

    setStats({
      total: photos.length,
      purchased: photos.filter((photo) => photo.status === 'purchased').length,
      available: photos.filter((photo) => photo.status === 'available').length,
      expired: photos.filter((photo) => photo.status === 'expired').length,
    });

    const attrMap = new Map<string, AttractionPhotoStats>();
    attractions.forEach((attraction) =>
      attrMap.set(attraction.id, {
        name: attraction.name,
        total: 0,
        purchased: 0,
        available: 0,
        expired: 0,
      })
    );
    photos.forEach((photo) => {
      const entry = photo.attraction_id ? attrMap.get(photo.attraction_id) : undefined;
      if (entry) {
        entry.total += 1;
        if (photo.status === 'purchased') entry.purchased += 1;
        else if (photo.status === 'available') entry.available += 1;
        else entry.expired += 1;
      }
    });
    setAttractionStats(Array.from(attrMap.values()).sort((a, b) => b.total - a.total));

    setNotice(null);
    setError(null);
    setLoading(false);
  }

  const conversionRate = stats.total > 0 ? (stats.purchased / stats.total) * 100 : 0;

  // Mehr verkaufte als aufgenommene Fotos kann es nicht geben - dann fehlen
  // Aufnahmen. Das passiert, wenn der Automat zeitweise ohne Verbindung war:
  // die verkauften Fotos liegen als DATEIEN auf dem PC und werden nachgeliefert,
  // die blosse ZAHL der Aufnahmen meldet dagegen nur der laufende Agent und ist
  // hinterher nicht mehr nachholbar.
  //
  // Am 16.08.2026 stand deshalb bei Imst "172 gekauft" neben "4 Aufnahmen" und
  // daraus 4300 % Conversion. Statt eine solche Zahl zu zeigen, sagen wir hier,
  // dass wir es nicht wissen - die Verkaufszahl selbst ist vollstaendig und
  // bleibt sichtbar. (F-040)
  const aufnahmenUnvollstaendig = stats.purchased > stats.total;
  const emailRate = emailDay && emailDay.total > 0 ? (emailDay.given / emailDay.total) * 100 : 0;
  const emailPie =
    emailDay && emailDay.total > 0
      ? [
          { key: 'given', value: emailDay.given, fill: '#10b981' },
          { key: 'rest', value: Math.max(0, emailDay.total - emailDay.given), fill: '#e2e8f0' },
        ]
      : [{ key: 'empty', value: 1, fill: '#e2e8f0' }];
  const pieData = [
    { name: 'Gekauft', value: stats.purchased },
    { name: 'Verfügbar', value: stats.available },
    { name: 'Abgelaufen', value: stats.expired },
  ].filter((d) => d.value > 0);

  if (loading) {
    return (
      <div className={embedded ? 'space-y-4 customer-embedded-root preview-photos' : 'space-y-6'}>
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/40" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/30" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={embedded ? 'space-y-4 customer-embedded-root preview-photos' : 'space-y-6'}>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('photos.title')}</h2>
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Photos</h3>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button onClick={loadData} className="glass-button-secondary">
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-4 customer-embedded-root preview-photos' : 'space-y-6'}>
      <div className="customer-operator-pagehead">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('photos.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('photos.subtitle')}</p>
      </div>

      {notice && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Photo data is currently unavailable.</p>
          <p className="mt-1 text-sm text-amber-700">{notice}</p>
        </div>
      )}

      {isKioskPark && !isStaff && selectedDate && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/40 bg-white/40 px-4 py-3 backdrop-blur-xl">
          <div>
            <p className="text-sm font-semibold text-slate-700">Auswertung für {selectedDateLabel}</p>
            <p className="text-xs text-slate-400">Kacheln und Kreise beziehen sich auf diesen Tag</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => stepDay(-1)} className="glass-button-secondary customer-operator-btn p-2" aria-label="Vorheriger Tag">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              max={todayStr}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="rounded-xl border border-white/50 bg-white/70 px-3 py-2 text-sm text-slate-700 customer-operator-input"
            />
            <button
              type="button"
              onClick={() => stepDay(1)}
              disabled={selectedDate >= todayStr}
              className="glass-button-secondary customer-operator-btn p-2 disabled:opacity-40"
              aria-label="Nächster Tag"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {selectedDate !== todayStr && (
              <button type="button" onClick={() => setSelectedDate(todayStr)} className="glass-button-secondary customer-operator-btn px-3 py-2 text-sm">
                Heute
              </button>
            )}
          </div>
        </div>
      )}

      {aufnahmenUnvollstaendig && (
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-4 sm:p-5">
          <p className="text-sm font-semibold text-amber-900">
            Für diesen Tag fehlen Aufnahmen
          </p>
          <p className="mt-1 text-sm leading-relaxed text-amber-800">
            Es sind mehr Fotos verkauft als aufgenommen gemeldet worden — das kann nicht
            stimmen. Der Automat war an diesem Tag zeitweise ohne Verbindung. Die
            verkauften Fotos liegen als Dateien vor und wurden vollständig nachgeliefert,
            die Zahl der Aufnahmen lässt sich nachträglich nicht mehr ermitteln.
          </p>
          <p className="mt-2 text-sm text-amber-800">
            <span className="font-medium">Verlässlich ist:</span>{' '}
            {formatNumber(stats.purchased)} verkaufte Fotos.{' '}
            <span className="font-medium">Nicht verlässlich:</span> Aufnahmen, Verfügbar
            und Conversion — sie werden deshalb nicht angezeigt.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-4">
        <KPICard
          title={t('photos.total')}
          value={aufnahmenUnvollstaendig ? '—' : formatNumber(stats.total)}
          subtitle={
            aufnahmenUnvollstaendig
              ? 'nicht vollständig gemeldet'
              : kioskConv
                ? `Aufnahmen · ${selectedDateLabel}`
                : undefined
          }
          icon={Camera}
        />
        {!isStaff && (
          <KPICard
            title={t('photos.purchased')}
            value={formatNumber(stats.purchased)}
            subtitle={kioskConv ? `${formatNumber(kioskConv.soldLifetime)} gesamt` : undefined}
            icon={ShoppingBag}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-100"
          />
        )}
        <KPICard
          title={t('photos.available')}
          value={aufnahmenUnvollstaendig ? '—' : formatNumber(stats.available)}
          subtitle={aufnahmenUnvollstaendig ? 'nicht ermittelbar' : undefined}
          icon={Eye}
          iconColor="text-amber-600"
          iconBg="bg-amber-100"
        />
        {!isStaff && (
          <KPICard
            title={t('photos.conversion')}
            value={aufnahmenUnvollstaendig ? '—' : formatPercent(conversionRate)}
            subtitle={
              aufnahmenUnvollstaendig
                ? 'Aufnahmen fehlen'
                : kioskConv
                  ? 'an diesem Tag'
                  : undefined
            }
            icon={Clock}
            iconColor="text-cyan-600"
            iconBg="bg-cyan-100"
          />
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {!isStaff && (
        <GlassCard className="p-5 sm:p-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-4 text-base font-semibold text-slate-800">{t('photos.status_distribution')}</h3>
              {aufnahmenUnvollstaendig ? (
                // Ohne verlaessliche Aufnahmezahl bestuende der Ring nur aus dem
                // Segment "Gekauft" und saehe damit aus, als waere jede Fahrt
                // gekauft worden. Lieber die eine Zahl nennen, die stimmt.
                <div className="rounded-xl bg-white/30 p-4 text-sm leading-relaxed text-slate-500">
                  Ohne die Zahl der Aufnahmen lässt sich die Verteilung nicht
                  darstellen. Gesichert ist nur:{' '}
                  <span className="font-medium text-slate-700">
                    {formatNumber(stats.purchased)} verkaufte Fotos
                  </span>
                  .
                </div>
              ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="h-40 w-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={70} dataKey="value" strokeWidth={0}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full space-y-2">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i] }} />
                      <div>
                        <p className="text-sm font-medium text-slate-700">{d.name}</p>
                        <p className="text-xs text-slate-400">{formatNumber(d.value)} Fotos</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}
            </div>

            {kioskConv && kioskConv.taken > 0 && aufnahmenUnvollstaendig && (
              <div>
                <h3 className="mb-4 text-base font-semibold text-slate-800">Conversion</h3>
                <div className="rounded-xl bg-white/30 p-4 text-sm leading-relaxed text-slate-500">
                  Für diesen Tag nicht berechenbar. Die Conversion setzt die verkauften
                  Fotos ins Verhältnis zu den Aufnahmen — und die Aufnahmen wurden an
                  diesem Tag nicht vollständig gemeldet.
                </div>
              </div>
            )}

            {kioskConv && kioskConv.taken > 0 && !aufnahmenUnvollstaendig && (
              <div>
                <h3 className="mb-4 text-base font-semibold text-slate-800">Conversion</h3>
                <div className="flex flex-col items-center gap-4">
                  <div className="relative h-40 w-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Verkauft', value: kioskConv.sold },
                            { name: 'Nicht gekauft', value: Math.max(0, kioskConv.taken - kioskConv.sold) },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          startAngle={90}
                          endAngle={-270}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          <Cell fill="#0ea5e9" />
                          <Cell fill="#f43f5e" />
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-bold text-slate-800">{formatPercent(conversionRate)}</span>
                      <span className="text-[10px] text-slate-400">verkauft</span>
                    </div>
                  </div>
                  <div className="w-full space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: '#0ea5e9' }} />
                      <div>
                        <p className="text-sm font-medium text-slate-700">Verkauft</p>
                        <p className="text-xs text-slate-400">{formatNumber(kioskConv.sold)} Fotos</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: '#f43f5e' }} />
                      <div>
                        <p className="text-sm font-medium text-slate-700">Fahrten ohne Kauf</p>
                        <p className="text-xs text-slate-400">{formatNumber(Math.max(0, kioskConv.taken - kioskConv.sold))} Fotos</p>
                      </div>
                    </div>
                    <p className="pt-1 text-xs text-slate-500">von {formatNumber(kioskConv.taken)} Fahrten</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </GlassCard>
        )}

        <GlassCard className="p-5 sm:p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">{t('photos.by_attraction')}</h3>
          <div className="space-y-3">
            {attractionStats.length === 0 && (
              <div className="rounded-xl bg-white/30 p-4 text-sm text-slate-500">
                Für diesen Tag liegen noch keine Attraktions-Daten vor.
              </div>
            )}
            {attractionStats.map((a) => {
              const pct = a.total > 0 ? (a.purchased / a.total) * 100 : 0;
              // Gleiche Lage wie oben, nur je Attraktion: mehr verkauft als
              // aufgenommen heisst, die Aufnahmezahl fehlt - nicht, dass die
              // Quote bei 4300 % liegt. (F-040)
              const luecke = a.purchased > a.total;
              return (
                <div key={a.name} className="flex items-center justify-between gap-3 rounded-xl bg-white/30 p-3.5 sm:gap-4 sm:p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700">{a.name}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {luecke
                        ? `${formatNumber(a.purchased)} verkauft · Aufnahmen unvollständig`
                        : `${formatNumber(a.total)} Aufnahmen${!isStaff ? ` · ${formatNumber(a.purchased)} verkauft` : ''}`}
                    </p>
                  </div>
                  {!isStaff && luecke && (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center sm:h-20 sm:w-20">
                      <span className="text-lg font-semibold text-slate-300">—</span>
                    </div>
                  )}
                  {!isStaff && !luecke && (
                    <div className="relative h-16 w-16 shrink-0 sm:h-20 sm:w-20">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Gekauft', value: a.purchased },
                              { name: 'Rest', value: Math.max(0, a.total - a.purchased) },
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={26}
                            outerRadius={36}
                            startAngle={90}
                            endAngle={-270}
                            dataKey="value"
                            strokeWidth={0}
                          >
                            <Cell fill="#0ea5e9" />
                            <Cell fill="#e2e8f0" />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-semibold text-slate-700">{formatPercent(pct)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {!isStaff && emailDay && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-white/30 p-3.5 sm:gap-4 sm:p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700">E-Mail-Erfassung</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {emailDay.total > 0
                      ? `${formatNumber(emailDay.given)} von ${formatNumber(emailDay.total)} Käufern`
                      : 'Keine Käufe an diesem Tag'}
                  </p>
                </div>
                <div className="relative h-16 w-16 shrink-0 sm:h-20 sm:w-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={emailPie}
                        cx="50%"
                        cy="50%"
                        innerRadius={26}
                        outerRadius={36}
                        startAngle={90}
                        endAngle={-270}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {emailPie.map((e) => (
                          <Cell key={e.key} fill={e.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-semibold text-slate-700">
                      {emailDay.total > 0 ? formatPercent(emailRate) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-800">Foto-Browser</h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRefreshBrowse}
              disabled={browseLoading}
              className="glass-button-secondary customer-operator-btn flex items-center gap-2 text-sm"
            >
              <RefreshCw className={`h-4 w-4 ${browseLoading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </button>

            {/* Die beiden Automaten-Knoepfe.
                Sie erscheinen nur, wenn der Automat sie SELBST anbietet: das
                Testfoto ueber `can_test_photo`, der Neustart ueber einen
                Eintrag `camera` in `restartable`. Laeuft der Agent ohne
                Bildschirmzugriff oder ist die Kamerasoftware nicht
                eingerichtet, fehlen sie - besser als ein Knopf, der ins Leere
                greift. */}
            {automaten.filter((a) => a.can_test_photo).map((a) => (
              <button
                key={`t-${a.id}`}
                onClick={() => void automatAuftrag(a, 'testphoto')}
                disabled={automatBusy !== null}
                className="glass-button-primary customer-operator-btn flex items-center gap-2 text-sm disabled:opacity-40"
              >
                <Camera className="h-4 w-4" />
                {automatBusy === `${a.id}:testphoto` ? 'wird ausgelöst…' : 'Testfoto aufnehmen'}
                {automaten.length > 1 && <span className="opacity-70">· {a.machine_label || a.machine_id}</span>}
              </button>
            ))}

            {automaten
              .filter((a) => (a.restartable || []).some((r) => r.key === 'camera'))
              .map((a) => (
                <button
                  key={`c-${a.id}`}
                  onClick={() => void automatAuftrag(a, 'camera')}
                  disabled={automatBusy !== null}
                  className="glass-button-secondary customer-operator-btn flex items-center gap-2 text-sm disabled:opacity-40"
                >
                  <RotateCw className={`h-4 w-4 ${automatBusy === `${a.id}:camera` ? 'animate-spin' : ''}`} />
                  {automatBusy === `${a.id}:camera` ? 'wird neu gestartet…' : 'Kamera-Software neu starten'}
                  {automaten.length > 1 && <span className="opacity-70">· {a.machine_label || a.machine_id}</span>}
                </button>
              ))}
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <form onSubmit={handleCodeSearch} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={codeQuery}
              onChange={(e) => setCodeQuery(e.target.value)}
              placeholder="Bildnummer eingeben…"
              className="glass-input customer-operator-input w-full text-sm sm:w-48"
            />
            <button type="submit" className="glass-button-secondary customer-operator-btn flex items-center gap-1.5 text-sm">
              <Search className="h-4 w-4" />
              Suchen
            </button>
          </form>

          <form onSubmit={handleDateTimeSearch} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="datetime-local"
              value={dateTimeQuery}
              onChange={(e) => setDateTimeQuery(e.target.value)}
              className="glass-input customer-operator-input w-full text-sm"
            />
            <button type="submit" className="glass-button-secondary customer-operator-btn flex items-center gap-1.5 text-sm">
              <CalendarClock className="h-4 w-4" />
              Suchen
            </button>
          </form>

          {activeSearch !== 'recent' && (
            <button
              onClick={handleClearSearch}
              className="customer-operator-reset-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
              Suche zurücksetzen
            </button>
          )}
        </div>

        {browseError && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {browseError}
          </div>
        )}

        {embedded && selectedPhoto && <div className="customer-embedded-selected-card">{renderSelectedPhotoCard()}</div>}

        <div className={embedded ? 'space-y-4' : 'grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'}>
          <div className={`grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 ${embedded ? '2xl:grid-cols-5' : 'order-2 lg:order-1'}`}>
            {!browseLoading && browsePhotos.length === 0 && (
              <div className="col-span-full rounded-xl bg-white/30 p-6 text-center text-sm text-slate-500">
                Keine Fotos gefunden.
              </div>
            )}
            {browsePhotos.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPhoto(p)}
                className={`embedded-photo-tile group overflow-hidden rounded-xl bg-white/30 text-left transition-all hover:bg-white/50 hover:shadow-md ${
                  selectedPhoto?.id === p.id ? 'ring-2 ring-brand-500' : ''
                }`}
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  {p.imageUrl && (
                    <img
                      src={p.imageUrl}
                      alt="Photo"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  )}
                  {/* Testfotos sind auf den ersten Blick als solche erkennbar -
                      sonst haelt man sie fuer einen Verkauf, den es nie gab. */}
                  {p.isTest && (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                      Testfoto
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="truncate text-[11px] font-medium text-slate-700">{p.externalCode || p.id}</p>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">{formatRelative(p.capturedAt)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        p.isTest ? 'bg-amber-50 text-amber-700'
                          : p.isPaid ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-sky-50 text-sky-700'
                      }`}
                    >
                      {p.isTest ? 'kein Umsatz' : p.isPaid ? 'purchased' : 'available'}
                    </span>
                  </div>
                  {p.speedKmh !== null && (
                    <p className="mt-1 text-[10px] font-medium text-slate-500">{p.speedKmh.toFixed(1)} km/h</p>
                  )}
                </div>
              </button>
            ))}
          </div>

          {!embedded && (
            <div className="order-1 lg:order-2 lg:sticky lg:top-6 lg:self-start">
              {renderSelectedPhotoCard()}
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
