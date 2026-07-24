import { useEffect, useState, type FormEvent } from 'react';
import { Camera, ShoppingBag, Eye, Clock, RefreshCw, Search, CalendarClock, X } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { getOptionalSourceWarning, invokeEdgeFunction, isEdgeSourceUnavailable } from '../lib/edgeFunctions';
import { formatNumber, formatPercent, formatRelative, formatDateTime } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import KPICard from '../components/ui/KPICard';
import { useI18n } from '../lib/i18n';
import { usePark } from '../contexts/ParkContext';
import { useAuth } from '../contexts/AuthContext';
import { fetchRecentPhotos, searchPhotosByCode, searchPhotosByDateTime, claimLinkFor, type BrowsablePhoto } from '../lib/photoBrowser';
import { fetchKioskSales, aggregateByDate } from '../lib/kioskSales';

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
  const { parkId, isKioskPark, parkName } = usePark();
  // Staff must not see purchase/conversion numbers (sales data).
  const { isStaff } = useAuth();
  const [stats, setStats] = useState({ total: 0, purchased: 0, available: 0, expired: 0 });
  // Kiosk-only: real sold vs rides (taken) for the conversion donut. Conversion
  // is measured only over days that have BOTH numbers (since ride tracking
  // started 2026-07-19); soldLifetime is the full permanent-rollup total.
  const [kioskConv, setKioskConv] = useState<{ sold: number; taken: number; soldLifetime: number } | null>(null);
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

  useEffect(() => {
    setSelectedPhoto(null);
    if (parkId) runBrowse('recent');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkId]);

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
        // Conversion only over days that have BOTH sold and rides (taken),
        // otherwise sold (15 days) vs rides (5 days) would be nonsense.
        const rideDays = days.filter((d) => d.expectedCount !== null && d.expectedCount > 0);
        const taken = rideDays.reduce((sum, d) => sum + (d.expectedCount ?? 0), 0);
        const sold = rideDays.reduce((sum, d) => sum + d.soldCount, 0);
        const soldLifetime = days.reduce((sum, d) => sum + d.soldCount, 0);
        const available = Math.max(0, taken - sold);
        setStats({ total: taken, purchased: sold, available, expired: 0 });
        setKioskConv({ sold, taken, soldLifetime });

        let attrName = parkName || 'Automat';
        const attrRes = await invokeEdgeFunction<{ attractions: { name: string; is_active?: boolean }[] }>(
          'external-attractions',
          { query: { park_id: parkId } },
        );
        const activeAttr = (attrRes.data?.attractions || []).find((a) => a.is_active !== false);
        if (activeAttr?.name) attrName = activeAttr.name;
        setAttractionStats([{ name: attrName, total: taken, purchased: sold, available, expired: 0 }]);

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
  const pieData = [
    { name: 'Purchased', value: stats.purchased },
    { name: 'Available', value: stats.available },
    { name: 'Expired', value: stats.expired },
  ].filter((d) => d.value > 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/40" />
        <div className="grid gap-6 sm:grid-cols-4">
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

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          title={t('photos.total')}
          value={formatNumber(stats.total)}
          subtitle={kioskConv ? 'Aufnahmen seit 19.7.' : undefined}
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
            subtitle={kioskConv ? 'seit Fahrten-Zählung' : undefined}
            icon={Clock}
            iconColor="text-cyan-600"
            iconBg="bg-cyan-100"
          />
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {!isStaff && (
        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">{t('photos.status_distribution')}</h3>
          <div className="flex items-center gap-8">
            <div className="h-48 w-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" strokeWidth={0}>
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
            <div className="space-y-3">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i] }} />
                  <div>
                    <p className="text-sm font-medium text-slate-700">{d.name}</p>
                    <p className="text-xs text-slate-400">{formatNumber(d.value)} photos</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {kioskConv && kioskConv.taken > 0 && (
            <div className="mt-6 border-t border-slate-200/60 pt-6">
              <h3 className="mb-4 text-base font-semibold text-slate-800">Conversion</h3>
              <div className="flex items-center gap-8">
                <div className="relative h-48 w-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Verkauft', value: kioskConv.sold },
                          { name: 'Nicht gekauft', value: Math.max(0, kioskConv.taken - kioskConv.sold) },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={80}
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
                    <span className="text-2xl font-bold text-slate-800">{formatPercent(conversionRate)}</span>
                    <span className="text-xs text-slate-400">verkauft</span>
                  </div>
                </div>
                <div className="space-y-3">
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
                  <p className="pt-1 text-xs text-slate-500">von {formatNumber(kioskConv.taken)} Fahrten gesamt</p>
                </div>
              </div>
            </div>
          )}
        </GlassCard>
        )}

        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">{t('photos.by_attraction')}</h3>
          <div className="space-y-3">
            {attractionStats.length === 0 && (
              <div className="rounded-xl bg-white/30 p-4 text-sm text-slate-500">
                No attraction mapping available in the current photo feed yet.
              </div>
            )}
            {attractionStats.map((a) => {
              const pct = a.total > 0 ? (a.purchased / a.total) * 100 : 0;
              return (
                <div key={a.name} className="rounded-xl bg-white/30 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">{a.name}</span>
                    <span className="text-xs text-slate-500">{formatNumber(a.total)} photos</span>
                  </div>
                  {!isStaff && (
                    <>
                      <div className="mb-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-sky-500 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-400">
                        {formatPercent(pct)} conversion ({formatNumber(a.purchased)} sold)
                      </p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-6">
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

        <div className="mb-6 flex flex-wrap gap-3">
          <form onSubmit={handleCodeSearch} className="flex items-center gap-2">
            <input
              type="text"
              value={codeQuery}
              onChange={(e) => setCodeQuery(e.target.value)}
              placeholder="Bildnummer eingeben…"
              className="glass-input w-48 text-sm"
            />
            <button type="submit" className="glass-button-secondary flex items-center gap-1.5 text-sm">
              <Search className="h-4 w-4" />
              Suchen
            </button>
          </form>

          <form onSubmit={handleDateTimeSearch} className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={dateTimeQuery}
              onChange={(e) => setDateTimeQuery(e.target.value)}
              className="glass-input text-sm"
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
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

          <div className="lg:sticky lg:top-6 lg:self-start">
            {selectedPhoto ? (
              <div className="rounded-xl bg-white/30 p-3">
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
                {(() => {
                  const claimLink = claimLinkFor(parkId, selectedPhoto.externalCode);
                  const imageLink = selectedPhoto.imageUrl;
                  return (
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
                      <p className="text-center text-[11px] leading-relaxed text-slate-400">
                        Claim-Link: der Kunde öffnet ihn und holt sein Foto per E-Mail (auch wenn der gedruckte QR
                        falsch war). Bild-Link: direkter Download.
                      </p>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl bg-white/20 p-6 text-center text-sm text-slate-400">
                Foto auswählen, um es hier groß anzuzeigen.
              </div>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
