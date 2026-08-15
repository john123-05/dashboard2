import { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Download } from 'lucide-react';
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
import AutomatHealth, { type HistoryEntry } from '../components/AutomatHealth';
import { benenne, stehtAmAutomaten } from '../lib/geraeteNamen';
import { useI18n } from '../lib/i18n';
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

export default function SystemHealth({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useI18n();
  const { parkId } = usePark();
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

  useEffect(() => {
    loadHealth();
  }, [parkId]);

  async function loadHealth(refresh = false) {
    if (!parkId) {
      setError('No park selected');
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
            ? 'The new operations health feed is not deployed yet. Showing the previous live system health view instead.'
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
          'System health feed is currently unavailable.',
      );
      setError(null);
      setLoading(false);
      return;
    }

    setData(result.data);
    setNotice(null);
    setError(null);
    setLoading(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadHealth(true);
    setRefreshing(false);
  }

  if (loading) {
    return (
      <div className={embedded ? 'space-y-4 customer-embedded-root preview-health' : 'space-y-6'}>
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
      <div className={embedded ? 'space-y-4 customer-embedded-root preview-health' : 'space-y-6'}>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('health.title')}</h2>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h3 className="mb-2 text-lg font-semibold text-red-800">{t('overview.error_title')}</h3>
          <p className="mb-4 text-sm text-red-600">{error || 'Unknown error'}</p>
          <button
            onClick={() => loadHealth(true)}
            className={embedded ? 'glass-button-secondary customer-operator-btn' : 'glass-button-secondary'}
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
  const communicationStatus = data.health.communication_status;

  // Alles, was am Automaten steht, fliegt hier raus - es steht oben im
  // Anlagenstatus, dort gemessen statt aus Dateien geraten.
  const serverDienste = services
    .filter((service) => !stehtAmAutomaten(service.name))
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
    critical: 'Kritisch',
    error: 'Fehler',
    warning: 'Warnung',
    info: 'Hinweis',
  };

  const errorColumns: DataTableColumn<ParkDashboardEvent>[] = [
    {
      key: 'occurred_at',
      label: 'Zeitpunkt',
      render: (item) => <span className="text-slate-600">{formatDateTime(item.occurred_at)}</span>,
    },
    {
      key: 'severity',
      label: 'Schwere',
      render: (item) => (
        <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${severityColor(item.severity)}`}>
          {SCHWERE[item.severity] || item.severity}
        </span>
      ),
    },
    {
      key: 'category',
      label: 'Art',
      render: (item) => (
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {item.category}
        </span>
      ),
    },
    {
      key: 'device',
      label: 'Gerät',
      render: (item) => <span>{item.device || '-'}</span>,
    },
    {
      key: 'description',
      label: 'Meldung',
    },
    {
      key: 'source_file',
      label: 'Herkunft',
      render: (item) => (
        <span className="font-mono text-xs text-slate-500">{item.source_file}</span>
      ),
    },
  ];

  return (
    <div className={embedded ? 'space-y-4 customer-embedded-root preview-health' : 'space-y-6'}>
      <div className="customer-operator-pagehead flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('health.title')}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Live operational health based on uploaded machine and system files
          </p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="glass-button-secondary customer-operator-btn">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {t('app.refresh')}
        </button>
      </div>

      {notice && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Health data is currently limited.</p>
          <p className="mt-1 text-sm text-amber-700">{notice}</p>
        </div>
      )}

      {/* Verbindung zur Datenquelle: ganz oben und auf eine Zeile eingedampft.
          Das ist die Voraussetzung fuer alles Weitere - stimmt sie nicht, sind
          saemtliche Zahlen darunter veraltet, und das muss man zuerst wissen.
          Die Kennzahlen daneben, weil sie denselben Ursprung haben. */}
      <GlassCard className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            {communicationStatus === 'down' ? (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            ) : communicationStatus === 'degraded' ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            ) : (
              <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            )}
            <div>
              <h3 className="text-base font-semibold text-slate-800">
                {communicationStatus === 'down'
                  ? 'Keine Verbindung zur Datenquelle'
                  : communicationStatus === 'degraded'
                    ? 'Datenquelle eingeschränkt erreichbar'
                    : 'Datenquelle erreichbar'}
              </h3>
              <p className="mt-0.5 text-sm text-slate-500">
                Zuletzt Daten empfangen:{' '}
                {data.health.last_data_at ? formatRelative(data.health.last_data_at) : 'noch nie'}
                {' · '}letzte Aktivität am Automaten:{' '}
                {data.health.last_activity_at ? formatRelative(data.health.last_activity_at) : 'unbekannt'}
              </p>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <Kennzahl
              label="Papier übrig"
              wert={data.health.printer.paper_remaining !== null
                ? formatNumber(data.health.printer.paper_remaining) : '-'}
            />
            <Kennzahl label="Drucke gesamt" wert={formatNumber(data.health.printer.print_count)} />
            <Kennzahl
              label="Fahrten gesamt"
              wert={data.summary.rides_total !== null && data.summary.rides_total !== undefined
                ? formatNumber(data.summary.rides_total) : '-'}
            />
            <Kennzahl
              label="Verkauft gesamt"
              wert={data.summary.photos_sold_total !== null && data.summary.photos_sold_total !== undefined
                ? formatNumber(data.summary.photos_sold_total) : '-'}
            />
          </div>
        </div>
      </GlassCard>

      {/* Zustand direkt vom Automaten: jedes Programm einzeln, aus dessen
          eigenen Protokolldateien. Das ist die Ebene, auf der ein Ausfall
          zuerst sichtbar wird - und die einzige, die der Betreiber selbst
          beheben kann. */}
      <AutomatHealth
        onVerlauf={(eintraege, verfuegbar) => {
          setVerlauf(eintraege);
          setVerlaufVerfuegbar(verfuegbar);
        }}
      />

      {/* Nur noch die Server-Dienste. Die Geräte des Automaten kamen hier ein
          zweites (und in "Geräte aus den Dateien" ein drittes) Mal vor, weil
          `park-dashboard-data` sie in alle drei Listen schreibt - daher stand
          die Lichtschranke mehrfach auf der Seite. Vollständig und mit Messwert
          stehen sie oben im Anlagenstatus; hier wären sie nur eine schlechtere
          Kopie. */}
      <GlassCard className="p-5 sm:p-6">
        <h3 className="text-base font-semibold text-slate-800">Dienste bei Liftpictures</h3>
        <p className="mb-4 mt-0.5 text-sm text-slate-500">
          Unsere Server hinter dem Automaten. Der Automat selbst steht oben.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {serverDienste.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Meldungen von den Diensten.</p>
          ) : (
            serverDienste.map(({ service, benennung }) => (
              <div key={service.name} className="rounded-xl bg-white/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      service.status === 'operational'
                        ? 'bg-emerald-500'
                        : service.status === 'degraded'
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-slate-800">
                      {benennung.klar}
                    </span>
                    {benennung.tech && (
                      <span className="ml-1.5 text-[11px] text-slate-400">
                        ({benennung.tech})
                      </span>
                    )}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {benennung.zweck || service.detail || '—'}
                </p>
              </div>
            ))
          )}
        </div>
      </GlassCard>

      {/* Alles, was passiert ist, in EINER Karte ganz unten.
          Vorher lag das an drei Stellen: "Recent health events" und
          "Errors & Logs" (im Legacy-Pfad dieselbe Liste, zweimal gerendert)
          sowie der Verlauf oben in der Anlagenstatus-Karte. Wer eine Störung
          suchte, musste an drei Orten nachsehen. Jetzt eine Karte mit zwei
          Registern, weil die beiden Quellen verschiedene Fragen beantworten:
          die Dateien sagen, was die Programme geschrieben haben; der Verlauf
          sagt, was der Automat selbst festgehalten hat - auch für Zeiten, in
          denen er offline war und gar nichts hochladen konnte. */}
      <GlassCard className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-white/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Was passiert ist</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              {register === 'dateien'
                ? 'Meldungen, die die Programme am Automaten geschrieben haben.'
                : 'Vom Automaten selbst festgehalten – auch aus Zeiten ohne Verbindung.'}
            </p>
          </div>
          <div className="inline-flex shrink-0 self-start rounded-xl bg-white/50 p-1 sm:self-auto">
            <button
              onClick={() => setRegister('dateien')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${register === 'dateien' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Aus den Dateien
              <span className="ml-1.5 tabular-nums text-slate-400">{formatNumber(errorItems.length)}</span>
            </button>
            <button
              onClick={() => setRegister('verlauf')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${register === 'verlauf' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Verlauf des Automaten
              <span className="ml-1.5 tabular-nums text-slate-400">{formatNumber(verlauf.length)}</span>
            </button>
          </div>
        </div>

        {register === 'dateien' ? (
          <div className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {(
                [
                  { wert: 'all', label: 'Alle', anzahl: errorItems.length },
                  { wert: 'critical', label: 'Kritisch', anzahl: severityCounts.critical },
                  { wert: 'error', label: 'Fehler', anzahl: severityCounts.error },
                  { wert: 'warning', label: 'Warnungen', anzahl: severityCounts.warning },
                  { wert: 'info', label: 'Hinweise', anzahl: severityCounts.info },
                ] as const
              ).map((f) => (
                <button
                  key={f.wert}
                  onClick={() => setSeverityFilter(f.wert)}
                  className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                    severityFilter === f.wert
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'bg-white/40 text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {f.label}
                  <span className="ml-1.5 tabular-nums text-slate-400">{formatNumber(f.anzahl)}</span>
                </button>
              ))}
            </div>
            <DataTable
              data={filteredErrors}
              columns={errorColumns}
              searchable
              searchKeys={['category', 'device', 'description', 'source_file', 'severity']}
              pageSize={14}
              embeddedOperator={embedded}
              actions={
                <button
                  onClick={handleExport}
                  className={embedded ? 'glass-button-secondary customer-operator-btn' : 'glass-button-secondary'}
                >
                  <Download className="h-4 w-4" />
                  Als CSV speichern
                </button>
              }
            />
          </div>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto p-2 sm:p-3">
            {!verlaufVerfuegbar ? (
              <p className="px-2 py-4 text-sm text-amber-800">
                Der dauerhafte Verlauf ist auf dem Server noch nicht eingerichtet.
              </p>
            ) : verlauf.length === 0 ? (
              <p className="px-2 py-4 text-sm text-slate-500">
                Noch keine Ereignisse aufgezeichnet.
              </p>
            ) : (
              verlauf.map((h) => (
                <div key={h.id} className="flex items-start gap-3 rounded-lg px-2 py-2 text-sm odd:bg-white/40">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    h.severity === 'error' ? 'bg-rose-500'
                      : h.severity === 'warning' ? 'bg-amber-500' : 'bg-slate-300'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-800">{h.summary}</p>
                    {h.detail && (
                      <p className="mt-0.5 break-words font-mono text-xs text-slate-500">{h.detail}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-slate-400">
                    {formatDateTime(h.occurred_at)}
                  </span>
                </div>
              ))
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
    <div className="rounded-xl bg-white/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800">{wert}</p>
    </div>
  );
}
