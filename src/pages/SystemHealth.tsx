import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Download, HelpCircle } from 'lucide-react';
import { getOptionalSourceWarning, invokeEdgeFunction, isEdgeSourceUnavailable } from '../lib/edgeFunctions';
import {
  createEmptyParkDashboardData,
  loadParkDashboardData,
  type ParkDashboardData,
  type ParkDashboardEvent,
} from '../lib/parkDashboard';
import { exportToCSV, formatDateTime, formatRelative, severityColor, formatNumber } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import DataTable, { type DataTableColumn } from '../components/ui/DataTable';
import AutomatHealth, { type HistoryEntry, type Urteil } from '../components/AutomatHealth';
import { UpgradePageHeader } from '../components/upgrade/UpgradeHero';
import { benenne, stehtAmAutomaten } from '../lib/geraeteNamen';
import { useI18n, useLocaleTag } from '../lib/i18n';
import { usePark } from '../contexts/ParkContext';

interface LegacySystemHealthResponse {
  generated_at: string;
  services: Array<{
    name: string;
    status: 'operational' | 'degraded' | 'down';
    latency?: number;
    detail?: string;
  }>;
  events: Array<{
    id: string;
    event_type: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    created_at: string;
  }>;
  metrics: Record<string, unknown>;
}

function latestIso(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

function mapLegacySystemHealth(
  parkId: string,
  legacy: LegacySystemHealthResponse,
): ParkDashboardData {
  const base = createEmptyParkDashboardData(parkId);
  const services = legacy.services || [];
  const events = legacy.events || [];
  const lastActivityAt = latestIso([
    legacy.metrics.last_photo_at as string | undefined,
    legacy.metrics.last_purchase_at as string | undefined,
    legacy.metrics.last_stripe_charge_at as string | undefined,
    legacy.generated_at,
  ]);

  const communicationStatus =
    services.some((service) => service.status === 'down')
      ? 'down'
      : services.some((service) => service.status === 'degraded')
        ? 'degraded'
        : 'operational';

  return {
    ...base,
    features: {
      ...base.features,
      stripe: true,
      health: true,
      errors: true,
    },
    summary: {
      ...base.summary,
      error_count: events.filter((event) => event.severity === 'error').length,
      warning_count: events.filter((event) => event.severity === 'warning').length,
      critical_count: events.filter((event) => event.severity === 'critical').length,
      last_activity_at: lastActivityAt,
      last_data_at: lastActivityAt,
    },
    health: {
      communication_status: communicationStatus,
      services: services.map((service) => ({
        name: service.name,
        status: service.status,
        detail: service.detail ?? (service.latency ? `${service.latency} ms` : null),
        last_seen_at: lastActivityAt,
      })),
      events: events.map((event) => ({
        id: event.id,
        occurred_at: event.created_at,
        severity: event.severity,
        category: event.event_type,
        payment_method: null,
        status: event.severity === 'critical' ? 'failed' : event.severity === 'warning' ? 'warning' : 'info',
        amount_cents: null,
        amount_kind: 'unknown',
        purchase_signal: 'none',
        description: event.message,
        source_file: 'system-health',
        raw_excerpt: event.message,
        device: null,
        tags: [event.event_type],
      })),
      devices: [],
      last_activity_at: lastActivityAt,
      last_data_at: lastActivityAt,
      printer: {
        paper_remaining: null,
        print_count: 0,
      },
    },
    errors: events.map((event) => ({
      id: event.id,
      occurred_at: event.created_at,
      severity: event.severity,
      category: event.event_type,
      payment_method: null,
      status: event.severity === 'critical' ? 'failed' : event.severity === 'warning' ? 'warning' : 'info',
      amount_cents: null,
      amount_kind: 'unknown',
      purchase_signal: 'none',
      description: event.message,
      source_file: 'system-health',
      raw_excerpt: event.message,
      device: null,
      tags: [event.event_type],
    })),
  };
}

export default function SystemHealth() {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const { parkId } = usePark();
  const [urteil, setUrteil] = useState<Urteil | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [data, setData] = useState<ParkDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'error' | 'warning' | 'info'>('all');
  // Der Verlauf wird von AutomatHealth geholt (die Function liefert ihn mit dem
  // Zustand zusammen) und hier unten neben den Dateimeldungen gezeigt.
  const [verlauf, setVerlauf] = useState<HistoryEntry[]>([]);
  const [verlaufVerfuegbar, setVerlaufVerfuegbar] = useState(true);
  const [register, setRegister] = useState<'dateien' | 'verlauf'>('dateien');
  const registerGewaehlt = useRef(false);

  useEffect(() => {
    loadHealth();
  }, [parkId]);

  async function loadHealth(refresh = false) {
    if (!parkId) {
      setError(t('health.no_park'));
      setLoading(false);
      return;
    }

    const result = await loadParkDashboardData(parkId, refresh);
    if (result.error || !result.data) {
      const legacyResult = await invokeEdgeFunction<LegacySystemHealthResponse>('system-health', {
        query: { park_id: parkId },
      });

      if (!legacyResult.error && legacyResult.data) {
        setData(mapLegacySystemHealth(parkId, legacyResult.data));
        setNotice(
          isEdgeSourceUnavailable(result.error)
            ? t('health.legacy_notice')
            : null,
        );
        setError(null);
        setLoading(false);
        return;
      }

      setData(createEmptyParkDashboardData(parkId));
      setNotice(
        getOptionalSourceWarning('System health feed', result.error) ||
          getOptionalSourceWarning('Legacy health feed', legacyResult.error) ||
          t('health.feed_unavailable'),
      );
      setError(null);
      setLoading(false);
      return;
    }

    setData(result.data);
    setNotice(null);
    setError(null);
    setLoading(false);
    setCheckedAt(new Date());
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    await loadHealth(true);
    setRefreshing(false);
  }

  // Sind aus den Dateien keine Meldungen da, aber im Verlauf, direkt den
  // Verlauf zeigen - solange niemand selbst ein Register gewählt hat.
  const dateienAnzahl = data?.errors?.length ?? 0;
  useEffect(() => {
    if (!registerGewaehlt.current && dateienAnzahl === 0 && verlauf.length > 0) setRegister('verlauf');
  }, [dateienAnzahl, verlauf.length]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/40" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl bg-white/30" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('health.title')}</h2>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h3 className="mb-2 text-lg font-semibold text-red-800">{t('overview.error_title')}</h3>
          <p className="mb-4 text-sm text-red-600">{error || t('app.unknown_error')}</p>
          <button
            onClick={() => loadHealth(true)}
            className="glass-button-secondary"
          >
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  }

  const services = data.health.services || [];
  const events = data.health.events || [];
  const errorItems = data.errors || [];

  // Das Banner ganz oben soll EINE Frage beantworten: sind die Zahlen darunter
  // aktuell? Das haengt am Alter der zuletzt empfangenen Daten - NICHT daran, ob
  // irgendein Einzeldienst "down" meldet. Vorher stand hier "Keine Verbindung
  // zur Datenquelle", sobald z. B. der Uploader eine Stoerung meldete, obwohl
  // die Daten gerade eben ankamen. Einzeldienste haben ihren eigenen Status
  // weiter unten.
  const datenAlterMin = data.health.last_data_at
    ? (Date.now() - new Date(data.health.last_data_at).getTime()) / 60000
    : Number.POSITIVE_INFINITY;
  const quelleStatus: 'operational' | 'degraded' | 'down' =
    datenAlterMin <= 20 ? 'operational' : datenAlterMin <= 120 ? 'degraded' : 'down';

  // Alles, was am Automaten steht, fliegt hier raus - es steht oben im
  // Anlagenstatus, dort gemessen statt aus Dateien geraten.
  // „Sonstige Protokolle" sind unbekannte Logdateien AM Automaten (der Agent
  // sammelt sie unter diesem Namen) - sie gehören nicht zu den Server-Diensten.
  const serverDienste = services
    .filter((service) => !stehtAmAutomaten(service.name) && !/^sonstige protokolle/i.test(service.name))
    .map((service) => ({ service, benennung: benenne(service.name) }));

  const filteredErrors =
    severityFilter === 'all'
      ? errorItems
      : errorItems.filter((item) => item.severity === severityFilter);

  function handleExport() {
    exportToCSV(
      filteredErrors.map((item) => ({
        occurred_at: item.occurred_at,
        severity: item.severity,
        category: item.category,
        device: item.device || '',
        source_file: item.source_file,
        status: item.status,
        payment_method: item.payment_method || '',
        description: item.description,
      })),
      'system-health-errors',
    );
  }

  const severityCounts = {
    critical: events.filter((event) => event.severity === 'critical').length,
    error: events.filter((event) => event.severity === 'error').length,
    warning: events.filter((event) => event.severity === 'warning').length,
    info: events.filter((event) => event.severity === 'info').length,
  };

  const SCHWERE: Record<string, string> = {
    critical: t('health.sev_critical'),
    error: t('health.sev_error'),
    warning: t('health.sev_warning'),
    info: t('health.sev_info'),
  };

  const errorColumns: DataTableColumn<ParkDashboardEvent>[] = [
    {
      key: 'occurred_at',
      label: t('health.col_time'),
      render: (item) => <span className="text-slate-600">{formatDateTime(item.occurred_at, locale)}</span>,
    },
    {
      key: 'severity',
      label: t('health.col_severity'),
      render: (item) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityColor(item.severity)}`}>
          {SCHWERE[item.severity] || item.severity}
        </span>
      ),
    },
    {
      key: 'category',
      label: t('health.col_kind'),
      render: (item) => (
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {item.category}
        </span>
      ),
    },
    {
      key: 'device',
      label: t('health.col_device'),
      render: (item) => <span>{item.device || '-'}</span>,
    },
    {
      key: 'description',
      label: t('health.col_message'),
    },
    {
      key: 'source_file',
      label: t('health.col_source'),
      render: (item) => (
        <span className="font-mono text-xs text-slate-500">{item.source_file}</span>
      ),
    },
  ];

  // Oben steht EIN Urteil. Kommt es vom Automaten (Anlagenstatus), gilt das;
  // ohne Automat bleibt die Frage, ob die Daten frisch sind.
  const quelleTitel =
    quelleStatus === 'down' ? t('health.source_stale') : quelleStatus === 'degraded' ? t('health.source_older') : t('health.source_ok');
  const gesamt: { ton: 'ok' | 'warn' | 'bad' | 'unklar'; titel: string; text: string } = urteil
    ? {
        ton: urteil.ton === 'bad' ? 'bad' : urteil.ton === 'warn' ? 'warn' : urteil.ton === 'unklar' || urteil.ton === 'aus' ? 'unklar' : 'ok',
        titel: urteil.titel,
        text: urteil.text,
      }
    : { ton: quelleStatus === 'down' ? 'bad' : quelleStatus === 'degraded' ? 'warn' : 'ok', titel: quelleTitel, text: '' };
  const TON_STIL = {
    ok: { Icon: CheckCircle2, kreis: 'bg-emerald-50 text-emerald-600 ring-emerald-200', balken: 'bg-emerald-500' },
    warn: { Icon: AlertTriangle, kreis: 'bg-amber-50 text-amber-600 ring-amber-200', balken: 'bg-amber-500' },
    bad: { Icon: XCircle, kreis: 'bg-rose-50 text-rose-600 ring-rose-200', balken: 'bg-rose-500' },
    unklar: { Icon: HelpCircle, kreis: 'bg-slate-100 text-slate-500 ring-slate-200', balken: 'bg-slate-300' },
  }[gesamt.ton];
  const quellePunkt = quelleStatus === 'down' ? 'bg-rose-500' : quelleStatus === 'degraded' ? 'bg-amber-500' : 'bg-emerald-500';
  const dienstePunkt = (status: string) =>
    status === 'operational' ? 'bg-emerald-500' : status === 'degraded' ? 'bg-amber-500' : 'bg-rose-500';
  const diensteOk = serverDienste.filter(({ service }) => service.status === 'operational').length;

  return (
    <div className="space-y-6">
      <div className="">
        <UpgradePageHeader
          title={t('health.title')}
          actions={
            <>
              {checkedAt && (
                <span className="text-xs text-[color:var(--ink-3)]">
                  {t('health.checked_at', { time: checkedAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })}
                </span>
              )}
              <button onClick={handleRefresh} disabled={refreshing} className="glass-button-secondary ">
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                {t('app.refresh')}
              </button>
            </>
          }
        />
      </div>

      {notice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">{t('health.data_limited')}</p>
          <p className="mt-1 text-sm text-amber-700">{notice}</p>
        </div>
      )}

      {/* Gesamtstatus: ein Urteil, darunter woher die Zahlen kommen und wie frisch
          sie sind. Rechts die Summen, weil sie aus derselben Quelle stammen. */}
      <GlassCard className="overflow-hidden p-0">
        <div className={`h-1 ${TON_STIL.balken}`} />
        <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${TON_STIL.kreis}`}>
              <TON_STIL.Icon className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[26px] font-light leading-tight tracking-tight text-[color:var(--ink)]">{gesamt.titel}</h3>
              {gesamt.text && <p className="mt-1 text-sm text-[color:var(--ink-2)]">{gesamt.text}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[color:var(--ink-3)]">
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${quellePunkt}`} />
                  {quelleTitel}
                </span>
                <span>
                  {t('health.last_data', { time: data.health.last_data_at ? formatRelative(data.health.last_data_at, locale) : t('health.never') })}
                </span>
                <span>
                  {t('health.last_activity', { time: data.health.last_activity_at ? formatRelative(data.health.last_activity_at, locale) : t('health.time.unknown') })}
                </span>
              </div>
            </div>
          </div>
          {/* Papier und Drucke stehen je Automat auf dessen Karte. */}
          <div className="flex shrink-0 gap-8 lg:border-l lg:border-[color:var(--line)] lg:pl-8">
            <Kennzahl
              label={t('health.rides_total')}
              wert={data.summary.rides_total !== null && data.summary.rides_total !== undefined ? formatNumber(data.summary.rides_total, locale) : '-'}
            />
            <Kennzahl
              label={t('health.sold_total')}
              wert={data.summary.photos_sold_total !== null && data.summary.photos_sold_total !== undefined ? formatNumber(data.summary.photos_sold_total, locale) : '-'}
            />
          </div>
        </div>
      </GlassCard>

      {/* Zustand direkt vom Automaten: jedes Programm einzeln, aus dessen
          eigenen Protokolldateien - die Ebene, die der Betreiber selbst beheben kann. */}
      <AutomatHealth
        refreshKey={refreshKey}
        onUrteil={setUrteil}
        onVerlauf={(eintraege, verfuegbar) => {
          setVerlauf(eintraege);
          setVerlaufVerfuegbar(verfuegbar);
        }}
      />

      {/* Nur die Server-Dienste. Was am Automaten steht, zeigt der Anlagenstatus
          oben vollständig und mit Messwert (stehtAmAutomaten). */}
      <GlassCard className="overflow-hidden p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[color:var(--line)] px-5 py-4">
          <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('health.services')}</h3>
          {serverDienste.length > 0 && (
            <span className="text-xs text-[color:var(--ink-3)]">{t('health.components_ok', { ok: diensteOk, total: serverDienste.length })}</span>
          )}
        </div>
        {serverDienste.length === 0 ? (
          <p className="px-5 py-4 text-sm text-[color:var(--ink-3)]">{t('health.no_service_reports')}</p>
        ) : (
          <ul className="divide-y divide-[color:var(--line)]">
            {serverDienste.map(({ service, benennung }) => (
              <li key={service.name} className="flex items-start gap-3 px-5 py-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dienstePunkt(service.status)}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[color:var(--ink)]">
                    {benennung.klar}
                    {benennung.tech && <span className="ml-1.5 text-[11px] font-normal text-[color:var(--ink-3)]">{benennung.tech}</span>}
                  </p>
                  <p className="mt-0.5 break-words text-xs text-[color:var(--ink-3)]">{benennung.zweck || service.detail || '—'}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      {/* Alles, was passiert ist, in EINER Karte: Meldungen aus den Dateien
          (was die Programme geschrieben haben) und der Verlauf des Automaten
          (was er selbst festgehalten hat, auch offline). */}
      <GlassCard className="overflow-hidden p-0">
        <div className="border-b border-[color:var(--line)] px-5 pt-4">
          <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('health.what_happened')}</h3>
          <div className="mt-3 flex gap-6">
            {(
              [
                { key: 'dateien', label: t('health.from_files'), count: errorItems.length },
                { key: 'verlauf', label: t('health.kiosk_history'), count: verlauf.length },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  registerGewaehlt.current = true;
                  setRegister(tab.key);
                }}
                className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition ${
                  register === tab.key
                    ? 'border-brand-600 text-[color:var(--ink)]'
                    : 'border-transparent text-[color:var(--ink-3)] hover:text-[color:var(--ink)]'
                }`}
              >
                {tab.label}
                <span className="ml-1.5 tabular-nums text-[color:var(--ink-3)]">{formatNumber(tab.count, locale)}</span>
              </button>
            ))}
          </div>
        </div>

        {register === 'dateien' ? (
          <div className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {(
                [
                  { wert: 'all', label: t('health.filter_all'), anzahl: errorItems.length },
                  { wert: 'critical', label: t('health.filter_critical'), anzahl: severityCounts.critical },
                  { wert: 'error', label: t('health.filter_error'), anzahl: severityCounts.error },
                  { wert: 'warning', label: t('health.filter_warning'), anzahl: severityCounts.warning },
                  { wert: 'info', label: t('health.filter_info'), anzahl: severityCounts.info },
                ] as const
              ).map((f) => (
                <button
                  key={f.wert}
                  onClick={() => setSeverityFilter(f.wert)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    severityFilter === f.wert
                      ? 'border-[color:var(--ink)] bg-[color:var(--ink)] text-white'
                      : 'border-[color:var(--line-strong)] text-[color:var(--ink-2)] hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                  <span className={`ml-1.5 tabular-nums ${severityFilter === f.wert ? 'text-white/70' : 'text-[color:var(--ink-3)]'}`}>{formatNumber(f.anzahl, locale)}</span>
                </button>
              ))}
            </div>
            <DataTable
              data={filteredErrors}
              columns={errorColumns}
              searchable
              searchKeys={['category', 'device', 'description', 'source_file', 'severity']}
              pageSize={14}
              actions={
                <button
                  onClick={handleExport}
                  className="glass-button-secondary"
                >
                  <Download className="h-4 w-4" />
                  {t('health.save_csv')}
                </button>
              }
            />
          </div>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto">
            {!verlaufVerfuegbar ? (
              <p className="px-5 py-4 text-sm text-amber-800">{t('health.history_not_set')}</p>
            ) : verlauf.length === 0 ? (
              <p className="px-5 py-4 text-sm text-[color:var(--ink-3)]">{t('health.no_events_yet')}</p>
            ) : (
              <ul className="divide-y divide-[color:var(--line)]">
                {verlauf.map((h) => (
                  <li key={h.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      h.severity === 'error' ? 'bg-rose-500' : h.severity === 'warning' ? 'bg-amber-500' : 'bg-slate-300'
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[color:var(--ink)]">{h.summary}</p>
                      {h.detail && <p className="mt-0.5 break-words font-mono text-xs text-[color:var(--ink-3)]">{h.detail}</p>}
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-[color:var(--ink-3)]">{formatDateTime(h.occurred_at, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

/** Eine kleine Zahl mit Beschriftung, wie sie oben neben der Datenquelle steht. */
function Kennzahl({ label, wert }: { label: string; wert: string }) {
  return (
    <div>
      <p className="text-xs text-[color:var(--ink-3)]">{label}</p>
      <p className="mt-1 text-[28px] font-light leading-none tabular-nums text-[color:var(--ink)]">{wert}</p>
    </div>
  );
}
