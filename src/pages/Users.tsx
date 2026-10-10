import SpeedmessungOffer from '../components/SpeedmessungOffer';
import { hasGuestActivity } from '../components/GuestActivityAwareOverlay';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users as UsersIcon, Search, Trophy, Gauge, TrendingDown, TrendingUp, ExternalLink, Trash2, Upload,
  ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, Hash, Monitor, Check, Loader2,
} from 'lucide-react';
import {
  fetchSpeedOverview, saveSpeedSettings, setSpeedResultHidden, shiftDate,
  type SpeedOverview, type SpeedPeriod, type SpeedSettings,
} from '../lib/speed';
import { addToSegment, createSegment } from '../lib/contactSegments';
import { useEntitlements } from '../lib/plans';
import { getOptionalSourceWarning, invokeEdgeFunction, isEdgeSourceUnavailable } from '../lib/edgeFunctions';
import {
  fetchGuestOverview,
  deleteGuest,
  setGuestAvatar,
  deleteGuestAvatar,
  type GuestOverview,
  type GuestDeleteAction,
} from '../lib/guestUsers';
import { accentColorForPark, accentTextColorForPark } from '../lib/parkBrand';
import { claimSiteBaseFor } from '../lib/photoBrowser';
import GlassCard from '../components/ui/GlassCard';
import { useI18n, useLocaleTag } from '../lib/i18n';
import { usePark } from '../contexts/ParkContext';

function formatSpeed(value: number | null, locale: string): string {
  return value != null ? `${value.toLocaleString(locale, { maximumFractionDigits: 1 })} km/h` : '—';
}

interface CustomerRow {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  opted_in_marketing: boolean;
  created_at: string;
  purchase_count: number;
  total_spent: number;
}

// Lokal (npm run dev) zeigt die Vorschau den lokalen imst-Server (Port 5181),
// damit neue Ranglisten schon vor dem Veroeffentlichen sichtbar sind.
function rankingBase(parkId: string | null): string {
  const base = claimSiteBaseFor(parkId) ?? '';
  return import.meta.env.DEV && base.startsWith('https://liftpictures-fotos.de')
    ? base.replace('https://liftpictures-fotos.de', 'http://localhost:5181')
    : base;
}

export default function Users() {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const { parkId } = usePark();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const { has } = useEntitlements();
  const [period, setPeriod] = useState<SpeedPeriod>('day');
  const [date, setDate] = useState('');
  const [speed, setSpeed] = useState<SpeedOverview | null>(null);
  const [speedError, setSpeedError] = useState<string | null>(null);
  const [speedBusy, setSpeedBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<SpeedSettings | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [segmentNote, setSegmentNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<GuestOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [guestSearch, setGuestSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ email: string; action: GuestDeleteAction } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [avatarBusyEmail, setAvatarBusyEmail] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [parkId]);

  // Rangliste, Tageswerte und Einstellungen für den gewählten Zeitraum.
  const loadSpeed = useCallback(async () => {
    if (!parkId) return;
    try {
      const data = await fetchSpeedOverview(parkId, period, date);
      setSpeed(data);
      setDraft((current) => current ?? data.settings);
      if (!date) setDate(data.date);
      setSpeedError(null);
    } catch (err) {
      setSpeedError(err instanceof Error ? err.message : t('app.loading_error'));
    }
  }, [parkId, period, date]);

  useEffect(() => {
    void loadSpeed();
  }, [loadSpeed]);

  // Registrierte Gaeste (nur fuer die Tagesbestenliste eingetragen) + Live-Bestenliste.
  useEffect(() => {
    if (!parkId) return;
    let cancelled = false;
    const load = () =>
      fetchGuestOverview(parkId)
        .then((data) => {
          if (cancelled) return;
          setOverview(data);
          setOverviewError(null);
        })
        .catch((err) => {
          if (!cancelled) setOverviewError(err instanceof Error ? err.message : t('app.loading_error'));
        });
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [parkId]);

  async function confirmDelete() {
    if (!parkId || !pendingDelete) return;
    setDeleting(true);
    try {
      await deleteGuest(parkId, pendingDelete.email, pendingDelete.action);
      setPendingDelete(null);
      setOverview(await fetchGuestOverview(parkId));
      setOverviewError(null);
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : t('users.delete_error'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleAvatarUpload(email: string, file: File) {
    if (!parkId) return;
    setAvatarBusyEmail(email);
    try {
      await setGuestAvatar(parkId, email, file);
      setOverview(await fetchGuestOverview(parkId));
      setOverviewError(null);
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : t('users.upload_error'));
    } finally {
      setAvatarBusyEmail(null);
    }
  }

  async function handleAvatarDelete(email: string) {
    if (!parkId) return;
    setAvatarBusyEmail(email);
    try {
      await deleteGuestAvatar(parkId, email);
      setOverview(await fetchGuestOverview(parkId));
      setOverviewError(null);
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : t('users.delete_error'));
    } finally {
      setAvatarBusyEmail(null);
    }
  }

  async function loadData() {
    setLoading(true);
    const { data, error: invokeError } = await invokeEdgeFunction('external-users', {
      useSessionAuth: true,
      query: { park_id: parkId || undefined },
    });

    if (invokeError) {
      console.error('Failed to fetch external users:', invokeError);
      if (isEdgeSourceUnavailable(invokeError)) {
        setCustomers([]);
        setNotice(getOptionalSourceWarning('User feed', invokeError));
        setError(null);
        setLoading(false);
        return;
      }
      setError(invokeError);
      setLoading(false);
      return;
    }

    const customersRes = { data: data?.customers ?? [] } as { data: any[] };
    const purchasesRes = { data: data?.purchases ?? [] } as { data: any[] };

    const purchasesByCustomer = new Map<string, { count: number; total: number }>();
    (purchasesRes.data || [])
      .filter((p) => p.status === 'completed')
      .forEach((p) => {
        const entry = purchasesByCustomer.get(p.customer_id) || { count: 0, total: 0 };
        entry.count += 1;
        entry.total += p.amount_cents;
        purchasesByCustomer.set(p.customer_id, entry);
      });

    const rows: CustomerRow[] = (customersRes.data || []).map((c) => {
      const stats = purchasesByCustomer.get(c.id) || { count: 0, total: 0 };
      return {
        ...c,
        purchase_count: stats.count,
        total_spent: stats.total,
      };
    });

    rows.sort((a, b) => b.total_spent - a.total_spent);
    setCustomers(rows);
    setNotice(null);
    setError(null);
    setLoading(false);
  }

  const today = speed?.today ?? '';
  const stats = speed?.stats;
  const ranked = (speed?.rows ?? []).filter((row) => !row.hidden);
  const hiddenRows = (speed?.rows ?? []).filter((row) => row.hidden);
  const shortDate = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  const rangeLabel = !speed
    ? ''
    : period === 'all'
      ? t('spd.range_all')
      : period === 'day'
        ? new Date(`${speed.date}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : period === 'month'
          ? new Date(`${speed.date}T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
          : t('spd.range_week', { from: shortDate(speed.from ?? speed.date), to: shortDate(speed.to ?? speed.date) });

  async function toggleHidden(id: string, hidden: boolean) {
    if (!parkId) return;
    setSpeedBusy(id);
    try {
      await setSpeedResultHidden(parkId, id, hidden);
      await loadSpeed();
      setPreviewVersion((v) => v + 1);
    } catch (err) {
      setSpeedError(err instanceof Error ? err.message : String(err));
    }
    setSpeedBusy(null);
  }

  async function saveSettings() {
    if (!parkId || !draft) return;
    setSpeedBusy('settings');
    setSettingsSaved(false);
    try {
      const res = await saveSpeedSettings(parkId, draft);
      setDraft(res.settings);
      setSettingsSaved(true);
      setPreviewVersion((v) => v + 1);
      await loadSpeed();
    } catch (err) {
      setSpeedError(err instanceof Error ? err.message : String(err));
    }
    setSpeedBusy(null);
  }

  // Die Besten als Segment speichern – von dort geht es mit einem Klick ins E-Mail-Marketing.
  async function saveTopAsSegment() {
    if (!parkId) return;
    const claimIds = ranked.slice(0, 10).map((row) => row.claimId).filter((id): id is string => Boolean(id));
    if (claimIds.length === 0) return;
    setSpeedBusy('segment');
    setSegmentNote(null);
    try {
      const name = `${t('spd.segment_name', { range: rangeLabel })} · ${new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
      const created = await createSegment(parkId, name.slice(0, 78));
      const res = await addToSegment(parkId, created.id, claimIds);
      setSegmentNote(t('spd.segment_saved', { name, count: res.added }));
    } catch (err) {
      setSpeedError(err instanceof Error ? err.message : String(err));
    }
    setSpeedBusy(null);
  }

  const patchDraft = (changes: Partial<SpeedSettings>) => {
    setDraft((current) => (current ? { ...current, ...changes } : current));
    setSettingsSaved(false);
  };

  const filteredGuests = (overview?.users ?? []).filter((u) => {
    if (!guestSearch) return true;
    const s = guestSearch.toLowerCase();
    return u.displayName.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-[28px] font-light tracking-tight text-[color:var(--ink)] sm:text-[32px]">{t('users.title')}</h2>
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-2">{t('users.load_error')}</h3>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button onClick={loadData} className="glass-button-secondary">
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  }

  const locked = !(hasGuestActivity(parkId) || has('speed'));

  const publicUrl = parkId && claimSiteBaseFor(parkId) ? `${rankingBase(parkId)}/ranking` : null;
  const kpi = (value: string, label: string, Icon: typeof Gauge, tone: string) => (
    <GlassCard className="p-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[22px] font-light leading-tight tracking-tight text-[color:var(--ink)]">{value}</p>
          <p className="truncate text-xs text-[color:var(--ink-3)]">{label}</p>
        </div>
      </div>
    </GlassCard>
  );
  const inputClass = 'mt-1 w-full rounded-lg border border-[color:var(--line-strong)] bg-white px-3 py-2 text-sm text-[color:var(--ink)] focus:border-brand-500 focus:outline-none';

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[28px] font-light tracking-tight text-[color:var(--ink)] sm:text-[32px]">{t('users.title')}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t('users.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/plaene?gruppe=speed" className="glass-button-secondary">
            {t('shop.view_plans')}
          </Link>
          {publicUrl && (
            <>
            <a
              href={`${publicUrl}${locked ? '?demo=1&tv=1' : '?tv=1'}`}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-button-secondary"
            >
              <Monitor className="h-4 w-4" />
              {t('spd.tv_view')}
            </a>
            <a
              href={`${publicUrl}${locked ? '?demo=1' : ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-button-secondary"
            >
              <ExternalLink className="h-4 w-4" />
              {t('users.open_browser')}
            </a>
            </>
          )}
        </div>
      </div>

      {notice && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">{t('users.unavailable')}</p>
          <p className="mt-1 text-sm text-amber-700">{notice}</p>
        </div>
      )}
      {speedError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{speedError}</p>}

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="min-w-0 space-y-5">
          {/* Zeitraum wählen und blättern (runde Pfeile wie auf der Fotos-Seite) */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex max-w-full overflow-x-auto rounded-md border border-[color:var(--line-strong)] p-0.5">
              {(['day', 'week', 'month', 'all'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  aria-pressed={period === key}
                  className={`shrink-0 rounded px-3.5 py-1.5 text-sm transition-colors ${
                    period === key ? 'bg-[color:var(--ink)] text-white' : 'text-[color:var(--ink-2)] hover:bg-slate-100'
                  }`}
                >
                  {t(`spd.period_${key}`)}
                </button>
              ))}
            </div>
            {period !== 'all' && date && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDate(shiftDate(date, period, -1))}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--line-strong)] bg-white text-[color:var(--ink-2)] hover:bg-slate-100"
                  aria-label={t('spd.prev')}
                  title={t('spd.prev')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <input
                  type="date"
                  value={date}
                  max={today || undefined}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className="rounded-full border border-[color:var(--line-strong)] bg-white px-3 py-1.5 text-sm text-[color:var(--ink)]"
                />
                <button
                  type="button"
                  onClick={() => setDate(shiftDate(date, period, 1) > today ? today : shiftDate(date, period, 1))}
                  disabled={!today || date >= today}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--line-strong)] bg-white text-[color:var(--ink-2)] hover:bg-slate-100 disabled:opacity-40"
                  aria-label={t('spd.next')}
                  title={t('spd.next')}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                {today && date !== today && (
                  <button type="button" onClick={() => setDate(today)} className="rounded-full border border-[color:var(--line-strong)] bg-white px-3 py-1.5 text-sm text-[color:var(--ink-2)] hover:bg-slate-100">
                    {t('spd.today')}
                  </button>
                )}
              </div>
            )}
            <p className="text-sm text-[color:var(--ink-3)]">{rangeLabel}</p>
          </div>

          {period === 'day' ? (
            <div>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {kpi(!speed ? '…' : formatSpeed(stats?.fastest ?? null, locale), t('spd.kpi_fastest'), TrendingUp, 'bg-emerald-50 text-emerald-600')}
                {kpi(!speed ? '…' : formatSpeed(stats?.slowest ?? null, locale), t('spd.kpi_slowest'), TrendingDown, 'bg-rose-50 text-rose-600')}
                {kpi(!speed ? '…' : formatSpeed(stats?.average ?? null, locale), t('spd.kpi_average'), Gauge, 'bg-sky-50 text-sky-600')}
                {kpi(!speed ? '…' : (stats?.count ?? 0).toLocaleString(locale), t('spd.kpi_rides'), Hash, 'bg-slate-100 text-slate-600')}
              </div>
              <p className="mt-2 text-xs text-[color:var(--ink-3)]">{t('spd.kpi_note')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {kpi(!speed ? '…' : formatSpeed(ranked[0]?.speedKmh ?? null, locale), t('spd.kpi_fastest'), TrendingUp, 'bg-emerald-50 text-emerald-600')}
              {kpi(!speed ? '…' : (speed.total ?? 0).toLocaleString(locale), t('spd.kpi_guests'), UsersIcon, 'bg-sky-50 text-sky-600')}
            </div>
          )}

          {locked ? (
            <SpeedmessungOffer />
          ) : (
            <>
          <GlassCard className="overflow-hidden p-0">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--line)] px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('spd.board_title')}</h3>
                <p className="mt-0.5 text-xs text-[color:var(--ink-3)]">{t('spd.board_sub')}</p>
              </div>
              {ranked.some((row) => row.claimId) && (
                <button type="button" onClick={() => void saveTopAsSegment()} disabled={speedBusy !== null} className="glass-button-secondary">
                  {speedBusy === 'segment' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('spd.segment_save', { count: Math.min(10, ranked.length) })}
                </button>
              )}
            </div>
            {segmentNote && (
              <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--line)] bg-emerald-50 px-5 py-3 text-sm text-emerald-800">
                <span className="min-w-0 flex-1">{segmentNote}</span>
                <Link to="/leads/email" className="font-semibold text-brand-700 hover:underline">{t('spd.write_email')}</Link>
              </div>
            )}
            {!speed ? (
              <div className="p-5"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /></div>
            ) : ranked.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-[color:var(--ink-3)]">{t('spd.empty')}</p>
            ) : (
              <ul className="divide-y divide-[color:var(--line)]">
                {ranked.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 px-5 py-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      row.rank === 1 ? 'bg-amber-100 text-amber-800' : row.rank <= 3 ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500'
                    }`}>{row.rank}</span>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {row.avatarUrl ? <img src={row.avatarUrl} alt="" className="h-full w-full object-cover" /> : (row.displayName?.[0] ?? '?').toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[color:var(--ink)]">{row.displayName || t('spd.guest')}</span>
                      <span className="block truncate text-xs text-[color:var(--ink-3)]">
                        {row.email.startsWith('claim:') ? '' : `${row.email} · `}
                        {new Date(row.capturedAt).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </span>
                    <span className="shrink-0 text-base font-semibold tabular-nums text-[color:var(--ink)]">{formatSpeed(row.speedKmh, locale)}</span>
                    <button
                      type="button"
                      onClick={() => void toggleHidden(row.id, true)}
                      disabled={speedBusy !== null}
                      aria-label={t('spd.hide')}
                      title={t('spd.hide')}
                      className="shrink-0 rounded-lg p-2 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)] disabled:opacity-40"
                    >
                      <EyeOff className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-[color:var(--line)] px-5 py-3 text-xs text-[color:var(--ink-3)]">{t('spd.hide_hint')}</p>
            {hiddenRows.length > 0 && (
              <div className="border-t border-[color:var(--line)] bg-slate-50 px-5 py-3">
                <p className="text-xs font-medium text-[color:var(--ink-3)]">{t('spd.hidden_title')}</p>
                <ul className="mt-2 space-y-1.5">
                  {hiddenRows.map((row) => (
                    <li key={row.id} className="flex items-center gap-3 text-sm text-[color:var(--ink-2)]">
                      <span className="min-w-0 flex-1 truncate">
                        {row.displayName || t('spd.guest')} · {formatSpeed(row.speedKmh, locale)} · {new Date(row.capturedAt).toLocaleDateString(locale)}
                      </span>
                      <button type="button" onClick={() => void toggleHidden(row.id, false)} disabled={speedBusy !== null} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                        <Eye className="h-3.5 w-3.5" /> {t('spd.unhide')}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </GlassCard>

          <GlassCard className="overflow-hidden p-0">
            <button type="button" onClick={() => setEditOpen((open) => !open)} aria-expanded={editOpen} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
              <span>
                <span className="block text-base font-semibold text-[color:var(--ink)]">{t('spd.edit_title')}</span>
                <span className="mt-0.5 block text-xs text-[color:var(--ink-3)]">{t('spd.edit_sub')}</span>
              </span>
              <ChevronDown className={`h-5 w-5 shrink-0 text-[color:var(--ink-3)] transition-transform ${editOpen ? 'rotate-180' : ''}`} />
            </button>
            {editOpen && draft && (
              <div className="space-y-4 border-t border-[color:var(--line)] px-5 py-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-slate-600">
                    {t('spd.f_headline')}
                    <input className={inputClass} value={draft.headline} maxLength={60} placeholder={t('spd.ph_headline')} onChange={(e) => patchDraft({ headline: e.target.value })} />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    {t('spd.f_subline')}
                    <input className={inputClass} value={draft.subline} maxLength={140} onChange={(e) => patchDraft({ subline: e.target.value })} />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    {t('spd.f_cta_title')}
                    <input className={inputClass} value={draft.cta_title} maxLength={80} placeholder={t('spd.ph_cta_title')} onChange={(e) => patchDraft({ cta_title: e.target.value })} />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    {t('spd.f_winner')}
                    <input className={inputClass} value={draft.winner_text} maxLength={200} placeholder={t('spd.ph_winner')} onChange={(e) => patchDraft({ winner_text: e.target.value })} />
                  </label>
                  <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                    {t('spd.f_cta_text')}
                    <textarea rows={2} className={inputClass} value={draft.cta_text} maxLength={300} onChange={(e) => patchDraft({ cta_text: e.target.value })} />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    {t('spd.f_instagram')}
                    <input className={inputClass} value={draft.instagram_handle} maxLength={40} placeholder="@" onChange={(e) => patchDraft({ instagram_handle: e.target.value })} />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    {t('spd.f_hashtag')}
                    <input className={inputClass} value={draft.hashtag} maxLength={40} placeholder="#" onChange={(e) => patchDraft({ hashtag: e.target.value })} />
                  </label>
                  <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                    {t('spd.f_prize')}
                    <input className={inputClass} value={draft.prize_text} maxLength={200} onChange={(e) => patchDraft({ prize_text: e.target.value })} />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    {t('spd.f_rows')}
                    <select className={inputClass} value={draft.rows} onChange={(e) => patchDraft({ rows: Number(e.target.value) })}>
                      {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    {t('spd.f_max')}
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      value={draft.max_speed_kmh ?? ''}
                      onChange={(e) => patchDraft({ max_speed_kmh: e.target.value ? Number(e.target.value) : null })}
                    />
                  </label>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-[color:var(--ink-2)]">
                    <input type="checkbox" checked={draft.show_qr} onChange={(e) => patchDraft({ show_qr: e.target.checked })} />
                    {t('spd.f_show_qr')}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[color:var(--ink-2)]">
                    <input type="checkbox" checked={draft.auto_scroll} onChange={(e) => patchDraft({ auto_scroll: e.target.checked })} />
                    {t('spd.f_auto_scroll')}
                  </label>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-600">{t('spd.f_periods')}</p>
                  <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2">
                    {(['day', 'week', 'month', 'all'] as const).map((key) => (
                      <label key={key} className="flex items-center gap-2 text-sm text-[color:var(--ink-2)]">
                        <input
                          type="checkbox"
                          checked={draft.periods.includes(key)}
                          onChange={(e) => {
                            const next = e.target.checked ? [...draft.periods, key] : draft.periods.filter((p) => p !== key);
                            if (next.length > 0) patchDraft({ periods: (['day', 'week', 'month', 'all'] as const).filter((p) => next.includes(p)) });
                          }}
                        />
                        {t(`spd.period_${key}`)}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => void saveSettings()} disabled={speedBusy !== null} className="glass-button-primary">
                    {speedBusy === 'settings' && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('spd.save')}
                  </button>
                  {settingsSaved && (
                    <span className="flex items-center gap-1 text-sm text-emerald-700"><Check className="h-4 w-4" /> {t('spd.saved')}</span>
                  )}
                </div>
              </div>
            )}
          </GlassCard>

          {customers.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {kpi(customers.length.toLocaleString(locale), t('users.total'), UsersIcon, 'bg-sky-50 text-sky-600')}
              {kpi(customers.filter((c) => c.purchase_count > 0).length.toLocaleString(locale), t('users.paying'), UsersIcon, 'bg-emerald-50 text-emerald-600')}
              {kpi(customers.filter((c) => c.opted_in_marketing).length.toLocaleString(locale), t('users.optins'), UsersIcon, 'bg-cyan-50 text-cyan-600')}
            </div>
          )}

          <GlassCard className="overflow-hidden">
            <div className="border-b border-slate-100/80 px-6 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-500">{t('users.registered_guests')}</h3>
                {overview && <span className="text-xs text-slate-400">{t('users.registered_count', { count: overview.users.length })}</span>}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {t('users.registered_hint')}
              </p>
              <div className="relative mt-3 max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={t('users.search_guest')}
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  className="glass-input py-2 pl-9 pr-4 text-sm"
                />
              </div>
            </div>

            <div className="p-6">
              {overviewError && (
                <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{overviewError}</p>
              )}

              {!overview ? (
                <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
              ) : filteredGuests.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {guestSearch ? t('users.no_results') : t('users.no_guests')}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredGuests.map((u) => {
                    const confirming = pendingDelete?.email === u.email ? pendingDelete : null;
                    const avatarBusy = avatarBusyEmail === u.email;
                    const inputId = `avatar-input-${u.email}`;
                    return (
                      <li key={u.email} className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-100 bg-slate-100 text-sm font-semibold text-slate-600">
                            {u.avatarUrl ? (
                              <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              (u.displayName[0] || '?').toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800">
                              {u.displayName}
                              {u.leaderboardOptOut && (
                                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                  {t('users.not_listed')}
                                </span>
                              )}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {u.email}
                              {u.bestSpeedKmh !== null ? ` · ${t('users.best_speed', { speed: u.bestSpeedKmh.toLocaleString(locale, { maximumFractionDigits: 1 }) })}` : ''}
                              {u.claimCount > 0 ? ` · ${t('users.photos', { count: u.claimCount })}` : ''}
                            </p>
                          </div>
                        </div>

                        {!confirming && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <input
                              id={inputId}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (file) void handleAvatarUpload(u.email, file);
                              }}
                            />
                            <button
                              type="button"
                              disabled={avatarBusy}
                              onClick={() => document.getElementById(inputId)?.click()}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                            >
                              <Upload className="h-3.5 w-3.5" />
                              {avatarBusy ? '…' : u.avatarUrl ? t('users.replace_image') : t('users.upload_image')}
                            </button>
                            {u.avatarUrl && (
                              <button
                                type="button"
                                disabled={avatarBusy}
                                onClick={() => void handleAvatarDelete(u.email)}
                                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                              >
                                {t('users.delete_image')}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setPendingDelete({ email: u.email, action: 'delete_profile' })}
                              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                            >
                              {t('users.delete_profile')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDelete({ email: u.email, action: 'delete_user' })}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {t('users.delete_user')}
                            </button>
                          </div>
                        )}

                        {confirming && (
                          <div className="mt-2 rounded-xl border border-red-100 bg-red-50/70 p-3">
                            <p className="text-xs text-red-800">
                              {confirming.action === 'delete_profile'
                                ? t('users.confirm_profile', { name: u.displayName })
                                : t('users.confirm_user', { name: u.displayName })}
                            </p>
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                disabled={deleting}
                                onClick={confirmDelete}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                              >
                                {deleting ? t('users.deleting') : t('users.yes_delete')}
                              </button>
                              <button
                                type="button"
                                disabled={deleting}
                                onClick={() => setPendingDelete(null)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                              >
                                {t('settings.product_modal.cancel')}
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </GlassCard>
            </>
          )}
        </div>

        {parkId && (
          <GlassCard className="flex h-[640px] flex-col overflow-hidden p-0 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ backgroundColor: accentColorForPark(parkId), color: accentTextColorForPark(parkId) }}
            >
              <Trophy className="h-4 w-4" />
              <span className="text-sm font-semibold">{t('users.preview_ranking')}</span>
            </div>
            {publicUrl ? (
              <iframe
                key={previewVersion}
                src={`${publicUrl}?embed=1${locked ? '&demo=1' : ''}`}
                title={t('users.preview_ranking')}
                scrolling="yes"
                className="w-full flex-1 border-0"
              />
            ) : (
              <p className="p-6 text-center text-sm text-slate-500">{t('users.no_ranking_page')}</p>
            )}
          </GlassCard>
        )}
      </div>
    </div>
  );
}
