import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, ShoppingBag, Eye, Clock, RefreshCw, Search, CalendarClock, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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

export default function Photos() {
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
    if (parkId) runBrowse('recent');
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
                <QRCodeSVG
                  value={claimLink}
                  size={168}
                  bgColor="#ffffff"
                  fgColor="#0f172a"
                  includeMargin
                  level="M"
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
      <div className="space-y-6">
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
      <div className="space-y-6">
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
    <div className="space-y-6">
      <div>
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
            <button type="button" onClick={() => stepDay(-1)} className="glass-button-secondary p-2" aria-label="Vorheriger Tag">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              max={todayStr}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="rounded-xl border border-white/50 bg-white/70 px-3 py-2 text-sm text-slate-700"
            />
            <button
              type="button"
              onClick={() => stepDay(1)}
              disabled={selectedDate >= todayStr}
              className="glass-button-secondary p-2 disabled:opacity-40"
              aria-label="Nächster Tag"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {selectedDate !== todayStr && (
              <button type="button" onClick={() => setSelectedDate(todayStr)} className="glass-button-secondary px-3 py-2 text-sm">
                Heute
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-4">
        <KPICard
          title={t('photos.total')}
          value={formatNumber(stats.total)}
          subtitle={kioskConv ? `Aufnahmen · ${selectedDateLabel}` : undefined}
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
        <KPICard title={t('photos.available')} value={formatNumber(stats.available)} icon={Eye} iconColor="text-amber-600" iconBg="bg-amber-100" />
        {!isStaff && (
          <KPICard
            title={t('photos.conversion')}
            value={formatPercent(conversionRate)}
            subtitle={kioskConv ? 'an diesem Tag' : undefined}
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
            </div>

            {kioskConv && kioskConv.taken > 0 && (
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
              return (
                <div key={a.name} className="flex items-center justify-between gap-3 rounded-xl bg-white/30 p-3.5 sm:gap-4 sm:p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700">{a.name}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatNumber(a.total)} Aufnahmen{!isStaff ? ` · ${formatNumber(a.purchased)} verkauft` : ''}
                    </p>
                  </div>
                  {!isStaff && (
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
          <button
            onClick={handleRefreshBrowse}
            disabled={browseLoading}
            className="glass-button-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw className={`h-4 w-4 ${browseLoading ? 'animate-spin' : ''}`} />
            Aktualisieren
          </button>
        </div>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <form onSubmit={handleCodeSearch} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={codeQuery}
              onChange={(e) => setCodeQuery(e.target.value)}
              placeholder="Bildnummer eingeben…"
              className="glass-input w-full text-sm sm:w-48"
            />
            <button type="submit" className="glass-button-secondary flex items-center gap-1.5 text-sm">
              <Search className="h-4 w-4" />
              Suchen
            </button>
          </form>

          <form onSubmit={handleDateTimeSearch} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="datetime-local"
              value={dateTimeQuery}
              onChange={(e) => setDateTimeQuery(e.target.value)}
              className="glass-input w-full text-sm"
            />
            <button type="submit" className="glass-button-secondary flex items-center gap-1.5 text-sm">
              <CalendarClock className="h-4 w-4" />
              Suchen
            </button>
          </form>

          {activeSearch !== 'recent' && (
            <button
              onClick={handleClearSearch}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
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

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="order-2 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 lg:order-1">
            {!browseLoading && browsePhotos.length === 0 && (
              <div className="col-span-full rounded-xl bg-white/30 p-6 text-center text-sm text-slate-500">
                Keine Fotos gefunden.
              </div>
            )}
            {browsePhotos.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPhoto(p)}
                className={`group overflow-hidden rounded-xl bg-white/30 text-left transition-all hover:bg-white/50 hover:shadow-md ${
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
                </div>
                <div className="p-2.5">
                  <p className="truncate text-[11px] font-medium text-slate-700">{p.externalCode || p.id}</p>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">{formatRelative(p.capturedAt)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        p.isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'
                      }`}
                    >
                      {p.isPaid ? 'purchased' : 'available'}
                    </span>
                  </div>
                  {p.speedKmh !== null && (
                    <p className="mt-1 text-[10px] font-medium text-slate-500">{p.speedKmh.toFixed(1)} km/h</p>
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="order-1 lg:order-2 lg:sticky lg:top-6 lg:self-start">
            {renderSelectedPhotoCard()}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
