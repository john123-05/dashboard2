import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpDown,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  LifeBuoy,
  Monitor,
  RefreshCw,
  ScanSearch,
  Search,
  Unplug,
} from 'lucide-react';
import { edgeFetch } from '../lib/edge-fetch';
import { getApiErrorMessage } from '../lib/api-error';
import type { Attraction, LiftpicMachineConfig, Park, SupportTicket } from '../lib/types';
import {
  loadParkDashboardData,
  type ParkDashboardData,
  type ParkDashboardEvent,
  type ParkDashboardService,
} from '../../lib/parkDashboard';
import { STAFF_SUPABASE_URL, supabaseBrowser } from '../lib/supabase';

interface PreviewData {
  prefix: string | null;
  filename: string;
  customerCode: string | null;
  legacyCustomerCode: string | null;
  timeCode: string | null;
  fileCode: string | null;
  speedKmh: number | null;
  matchedParkId: string | null;
  matchedParkName: string | null;
  matchedCustomerCode: string | null;
  matchedAttractionId: string | null;
  matchedAttractionName: string | null;
}

interface LiftpicResponse {
  parks: Park[];
  attractions: Attraction[];
  configs: LiftpicMachineConfig[];
}

type HealthStatus = 'operational' | 'degraded' | 'down';
type StatusFilter = 'all' | 'attention' | 'critical' | 'stable';
type SortKey = 'attention' | 'name' | 'last_data' | 'machines';

interface MachineHealthSummary {
  id: string;
  machineId: string;
  label: string;
  attractionName: string | null;
  lastSeenAt: string | null;
  status: HealthStatus;
  notes: string[];
  pairingStatus: LiftpicMachineConfig['pairing_status'];
}

interface StatusReason {
  label: string;
  status: HealthStatus;
}

interface ParkHealthRow {
  park: Park;
  dashboard: ParkDashboardData | null;
  dashboardError: string | null;
  services: ParkDashboardService[];
  events: ParkDashboardEvent[];
  machines: MachineHealthSummary[];
  tickets: SupportTicket[];
  status: HealthStatus;
  statusLabel: string;
  reasons: StatusReason[];
  alertCount: number;
  onlineMachines: number;
  degradedMachines: number;
  offlineMachines: number;
  lastDataAt: string | null;
  lastActivityAt: string | null;
  paperRemaining: number | null;
  queryText: string;
}

interface HealthServiceSummary {
  label: string;
  status: HealthStatus;
  detail: string;
}

interface AdminDatabaseHealth {
  status: HealthStatus;
  latencyMs: number | null;
  checkedAt: string;
  error: string | null;
  projectRef: string;
}

const DEFAULT_PREVIEW_PATH = 'plose-plosebob/1963186224002020.jpg';
const OPEN_TICKET_STATUSES: Array<SupportTicket['status']> = ['open', 'in_progress'];
const STAFF_PROJECT_REF = new URL(STAFF_SUPABASE_URL).hostname.split('.')[0] || 'staff-db';

const SORT_LABELS: Record<SortKey, string> = {
  attention: 'Nach Aufmerksamkeit',
  name: 'Nach Kunde',
  last_data: 'Älteste Daten zuerst',
  machines: 'Nach PC-Status',
};

function sortParks(list: Park[]) {
  return [...list].sort((a, b) => {
    const aImst = a.name.toLowerCase().includes('imst') ? 0 : 1;
    const bImst = b.name.toLowerCase().includes('imst') ? 0 : 1;
    if (aImst !== bImst) return aImst - bImst;
    return a.name.localeCompare(b.name, 'de');
  });
}

function formatDateTime(value: string | null) {
  if (!value) return 'Kein Signal';
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatRelative(value: string | null) {
  if (!value) return 'Kein Signal';
  const diffMin = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `vor ${diffHours} Std.`;
  const diffDays = Math.round(diffHours / 24);
  return `vor ${diffDays} Tag${diffDays === 1 ? '' : 'en'}`;
}

function statusRank(status: HealthStatus) {
  if (status === 'down') return 3;
  if (status === 'degraded') return 2;
  return 1;
}

function statusLabel(status: HealthStatus) {
  if (status === 'down') return 'Kritisch';
  if (status === 'degraded') return 'Auffällig';
  return 'Stabil';
}

function normalizeHealthStatus(value: string | null | undefined): HealthStatus {
  if (value === 'down') return 'down';
  if (value === 'degraded') return 'degraded';
  return 'operational';
}

function worsenStatus(current: HealthStatus, next: HealthStatus) {
  return statusRank(next) > statusRank(current) ? next : current;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function heartbeatStatus(lastSeenAt: string | null): HealthStatus {
  if (!lastSeenAt) return 'down';
  const diffMin = (Date.now() - new Date(lastSeenAt).getTime()) / 60000;
  if (diffMin <= 10) return 'operational';
  if (diffMin <= 60) return 'degraded';
  return 'down';
}

function dataFreshnessStatus(lastDataAt: string | null): HealthStatus {
  if (!lastDataAt) return 'down';
  const diffMin = (Date.now() - new Date(lastDataAt).getTime()) / 60000;
  if (diffMin <= 60) return 'operational';
  if (diffMin <= 360) return 'degraded';
  return 'down';
}

function severityStatus(event: ParkDashboardEvent): HealthStatus {
  if (event.severity === 'critical' || event.severity === 'error') return 'down';
  if (event.severity === 'warning') return 'degraded';
  return 'operational';
}

function machineSummary(config: LiftpicMachineConfig, attractionNameById: Record<string, string>): MachineHealthSummary {
  const payload = typeof config.last_status === 'object' && config.last_status ? config.last_status : {};
  const queueCount = numberValue(payload.queue_count);
  const pendingUploads = numberValue(payload.pending_uploads);
  const paperRemaining = numberValue(payload.paper_remaining);
  const ridesToday = numberValue(payload.rides_today);
  const lastError = stringValue(payload.last_error);
  let status = heartbeatStatus(config.last_seen_at);

  if (config.pairing_status !== 'paired') {
    status = worsenStatus(status, 'degraded');
  }

  if (paperRemaining !== null && paperRemaining <= Math.max(config.paper_warn_remaining || 0, 10)) {
    status = worsenStatus(status, paperRemaining <= 5 ? 'down' : 'degraded');
  }

  if (queueCount !== null && queueCount > 25) {
    status = worsenStatus(status, 'degraded');
  }

  if (pendingUploads !== null && pendingUploads > 50) {
    status = worsenStatus(status, 'degraded');
  }

  if (lastError) {
    status = worsenStatus(status, 'degraded');
  }

  const notes: string[] = [];
  if (paperRemaining !== null) notes.push(`Papier ${paperRemaining}`);
  if (queueCount !== null) notes.push(`Queue ${queueCount}`);
  if (pendingUploads !== null) notes.push(`Uploads ${pendingUploads}`);
  if (ridesToday !== null) notes.push(`Fahrten ${ridesToday}`);
  if (lastError) notes.push(`Fehler ${lastError}`);
  if (config.pairing_status !== 'paired') notes.push(`Pairing ${config.pairing_status}`);

  return {
    id: config.id,
    machineId: config.machine_id,
    label: config.machine_label || config.machine_id,
    attractionName: config.attraction_id ? attractionNameById[config.attraction_id] || null : null,
    lastSeenAt: config.last_seen_at,
    status,
    notes: notes.slice(0, 4),
    pairingStatus: config.pairing_status,
  };
}

async function checkAdminDatabaseHealth(): Promise<AdminDatabaseHealth> {
  const startedAt = performance.now();
  const checkedAt = new Date().toISOString();

  const { error } = await supabaseBrowser
    .from('parks')
    .select('id')
    .limit(1);

  const latencyMs = Math.round(performance.now() - startedAt);

  if (error) {
    return {
      status: 'down',
      latencyMs,
      checkedAt,
      error: error.message,
      projectRef: STAFF_PROJECT_REF,
    };
  }

  return {
    status: latencyMs > 900 ? 'degraded' : 'operational',
    latencyMs,
    checkedAt,
    error: null,
    projectRef: STAFF_PROJECT_REF,
  };
}

function buildCustomerUrl(parkId: string, section: 'health' | 'machines' | 'support', panel: 'details' | 'edit') {
  const params = new URLSearchParams({
    view: 'customers',
    customer: parkId,
    panel,
    section,
  });
  return `/staff/kunden-management?${params.toString()}`;
}

function buildParkRow(
  park: Park,
  dashboard: ParkDashboardData | null,
  dashboardError: string | null,
  machines: LiftpicMachineConfig[],
  tickets: SupportTicket[],
  attractionNameById: Record<string, string>,
): ParkHealthRow {
  const machineRows = machines.map((item) => machineSummary(item, attractionNameById));
  const services = dashboard?.health.services || [];
  const eventSource = dashboard?.errors.length ? dashboard.errors : dashboard?.health.events || [];
  const events = [...eventSource]
    .sort((left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime())
    .slice(0, 6);
  const onlineMachines = machineRows.filter((item) => item.status === 'operational').length;
  const degradedMachines = machineRows.filter((item) => item.status === 'degraded').length;
  const offlineMachines = machineRows.filter((item) => item.status === 'down').length;
  const lastDataAt = dashboard?.health.last_data_at || dashboard?.summary.last_data_at || null;
  const lastActivityAt = dashboard?.health.last_activity_at || dashboard?.summary.last_activity_at || null;
  const paperRemaining =
    dashboard?.summary.printer_paper_remaining ?? dashboard?.health.printer.paper_remaining ?? null;
  const criticalTickets = tickets.filter((ticket) => ticket.priority === 'critical');
  const summaryCritical = dashboard?.summary.critical_count ?? 0;
  const summaryWarnings = (dashboard?.summary.error_count ?? 0) + (dashboard?.summary.warning_count ?? 0);
  const reasons: StatusReason[] = [];
  let status = normalizeHealthStatus(dashboard?.health.communication_status);

  if (dashboardError) {
    status = worsenStatus(status, 'down');
    reasons.push({ label: 'Health-Feed fehlt', status: 'down' });
  }

  if (machineRows.length === 0) {
    reasons.push({ label: 'Kein Liftpic-PC', status: 'degraded' });
    status = worsenStatus(status, 'degraded');
  }

  if (machineRows.length > 0) {
    const freshness = dataFreshnessStatus(lastDataAt);
    status = worsenStatus(status, freshness);
    if (freshness === 'down') reasons.push({ label: 'Daten alt', status: 'down' });
    if (freshness === 'degraded') reasons.push({ label: 'Daten verzögert', status: 'degraded' });
  }

  if (offlineMachines > 0) {
    status = worsenStatus(status, 'down');
    reasons.push({ label: `${offlineMachines} PC offline`, status: 'down' });
  } else if (degradedMachines > 0) {
    status = worsenStatus(status, 'degraded');
    reasons.push({ label: `${degradedMachines} PC wackelig`, status: 'degraded' });
  }

  if (summaryCritical > 0) {
    status = worsenStatus(status, 'down');
    reasons.push({ label: `${summaryCritical} kritisch`, status: 'down' });
  } else if (summaryWarnings > 0) {
    status = worsenStatus(status, 'degraded');
    reasons.push({ label: `${summaryWarnings} Warnungen`, status: 'degraded' });
  }

  if (criticalTickets.length > 0) {
    status = worsenStatus(status, 'down');
    reasons.push({ label: `${criticalTickets.length} kritische Tickets`, status: 'down' });
  } else if (tickets.length > 0) {
    status = worsenStatus(status, 'degraded');
    reasons.push({ label: `${tickets.length} Support offen`, status: 'degraded' });
  }

  if (paperRemaining !== null && paperRemaining <= 10) {
    status = worsenStatus(status, paperRemaining <= 5 ? 'down' : 'degraded');
    reasons.push({ label: `Papier ${paperRemaining}`, status: paperRemaining <= 5 ? 'down' : 'degraded' });
  }

  const queryText = [
    park.name,
    park.slug,
    ...machineRows.map((item) => `${item.machineId} ${item.label} ${item.notes.join(' ')}`),
    ...services.map((item) => `${item.name} ${item.detail || ''}`),
    ...events.map((item) => `${item.category} ${item.description}`),
    ...tickets.map((item) => `${item.subject} ${item.description}`),
    ...reasons.map((item) => item.label),
  ]
    .join(' ')
    .toLowerCase();

  return {
    park,
    dashboard,
    dashboardError,
    services,
    events,
    machines: machineRows,
    tickets,
    status,
    statusLabel: statusLabel(status),
    reasons,
    alertCount:
      reasons.length +
      summaryCritical +
      summaryWarnings +
      offlineMachines +
      criticalTickets.length +
      Math.max(tickets.length - criticalTickets.length, 0),
    onlineMachines,
    degradedMachines,
    offlineMachines,
    lastDataAt,
    lastActivityAt,
    paperRemaining,
    queryText,
  };
}

export default function SystemHealthPage() {
  const navigate = useNavigate();
  const [parks, setParks] = useState<Park[]>([]);
  const [machineConfigs, setMachineConfigs] = useState<LiftpicMachineConfig[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [dashboardByParkId, setDashboardByParkId] = useState<Record<string, { data: ParkDashboardData | null; error: string | null }>>({});
  const [attractionNameById, setAttractionNameById] = useState<Record<string, string>>({});
  const [adminDatabaseHealth, setAdminDatabaseHealth] = useState<AdminDatabaseHealth | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingParkId, setRefreshingParkId] = useState<string | null>(null);
  const [pairingMachineId, setPairingMachineId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('attention');
  const [openParkId, setOpenParkId] = useState<string | null>(null);

  const [previewPath, setPreviewPath] = useState(DEFAULT_PREVIEW_PATH);
  const [previewResult, setPreviewResult] = useState<PreviewData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    void loadOverview();
    void runPreviewCheck(DEFAULT_PREVIEW_PATH, true);
  }, []);

  async function loadOverview(forceRefresh = false) {
    setError(null);
    setNotice(null);

    if (forceRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [ticketResult, machineResult, databaseResult] = await Promise.allSettled([
        supabaseBrowser
          .from('support_tickets')
          .select('id, organization_id, created_by, subject, description, status, priority, created_at, updated_at')
          .in('status', OPEN_TICKET_STATUSES)
          .order('created_at', { ascending: false }),
        edgeFetch('/api/admin/liftpic-machines'),
        checkAdminDatabaseHealth(),
      ]);

      if (machineResult.status !== 'fulfilled') {
        throw machineResult.reason;
      }

      const machineBody = await machineResult.value.json().catch(() => null);
      if (!machineResult.value.ok) {
        throw new Error(getApiErrorMessage(machineBody, 'Health-Daten konnten nicht geladen werden'));
      }

      const payload = ((machineBody?.data || {}) as LiftpicResponse) || { parks: [], attractions: [], configs: [] };
      const nextParks = sortParks((payload.parks || []).filter((item) => item.is_active));
      const nextConfigs = (payload.configs || []).filter((item) => item.is_active);
      const nextAttractionNameById = Object.fromEntries(
        (payload.attractions || []).map((item) => [item.id, item.name]),
      );

      const partialErrors: string[] = [];
      let nextTickets: SupportTicket[] = [];
      let nextDatabaseHealth: AdminDatabaseHealth | null = null;

      if (databaseResult.status === 'fulfilled') {
        nextDatabaseHealth = databaseResult.value;
        if (databaseResult.value.error) {
          partialErrors.push('Admin-Datenbank: keine Verbindung');
        }
      } else {
        nextDatabaseHealth = {
          status: 'down',
          latencyMs: null,
          checkedAt: new Date().toISOString(),
          error: 'Anfrage fehlgeschlagen',
          projectRef: STAFF_PROJECT_REF,
        };
        partialErrors.push('Admin-Datenbank: Anfrage fehlgeschlagen');
      }

      if (ticketResult.status === 'fulfilled') {
        if (ticketResult.value.error) {
          partialErrors.push(`Support: ${ticketResult.value.error.message}`);
        } else {
          nextTickets = (ticketResult.value.data || []) as SupportTicket[];
        }
      } else {
        partialErrors.push('Support: Anfrage fehlgeschlagen');
      }

      const dashboardEntries = await Promise.all(
        nextParks.map(async (park) => ({
          parkId: park.id,
          result: await loadParkDashboardData(park.id, forceRefresh),
        })),
      );

      const nextDashboardByParkId: Record<string, { data: ParkDashboardData | null; error: string | null }> = {};
      let dashboardFailures = 0;

      for (const entry of dashboardEntries) {
        nextDashboardByParkId[entry.parkId] = {
          data: entry.result.data,
          error: entry.result.error,
        };
        if (entry.result.error) dashboardFailures += 1;
      }

      if (dashboardFailures > 0) {
        partialErrors.push(`Health-Feed: ${dashboardFailures} Kunde${dashboardFailures === 1 ? '' : 'n'} ohne Live-Daten`);
      }

      setParks(nextParks);
      setMachineConfigs(nextConfigs);
      setTickets(nextTickets);
      setAttractionNameById(nextAttractionNameById);
      setDashboardByParkId(nextDashboardByParkId);
      setAdminDatabaseHealth(nextDatabaseHealth);
      setNotice(partialErrors.length > 0 ? partialErrors.join(' · ') : null);

      if (!openParkId && nextParks.length > 0) {
        setOpenParkId(nextParks[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Health-Seite konnte nicht geladen werden.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function refreshPark(parkId: string) {
    setRefreshingParkId(parkId);
    setStatusMessage(null);

    const result = await loadParkDashboardData(parkId, true);
    setDashboardByParkId((current) => ({
      ...current,
      [parkId]: {
        data: result.data,
        error: result.error,
      },
    }));

    const parkName = parks.find((item) => item.id === parkId)?.name || 'Kunde';
    if (result.error) {
      setNotice(`${parkName}: Health-Feed konnte nicht aktualisiert werden.`);
    } else {
      setStatusMessage(`${parkName} aktualisiert.`);
    }

    setRefreshingParkId(null);
  }

  async function regeneratePairingCode(machine: MachineHealthSummary) {
    setPairingMachineId(machine.id);
    setStatusMessage(null);
    setNotice(null);

    try {
      const res = await edgeFetch('/api/admin/liftpic-machines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: machine.id, action: 'new_pairing_code' }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setNotice(getApiErrorMessage(body, 'Neuer Pairing-Code fehlgeschlagen'));
        return;
      }

      const updated = body?.data as LiftpicMachineConfig | undefined;
      if (updated) {
        setMachineConfigs((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      }

      setStatusMessage(`${machine.label}: neuer Pairing-Code erstellt.`);
    } finally {
      setPairingMachineId(null);
    }
  }

  function showRestartHint(row: ParkHealthRow) {
    const criticalMachine = row.machines.find((item) => item.status === 'down') || row.machines[0];
    if (!criticalMachine) {
      setStatusMessage(`${row.park.name}: aktuell kein PC für einen Neustart-Hinweis hinterlegt.`);
      return;
    }

    const hint = criticalMachine.notes.some((item) => item.toLowerCase().includes('papier'))
      ? `${row.park.name}: Druckprozess an ${criticalMachine.machineId} lokal neu starten bzw. Drucker prüfen.`
      : `${row.park.name}: Liftpic Sync / Viewer an ${criticalMachine.machineId} lokal neu starten.`;

    setStatusMessage(hint);
  }

  async function runPreviewCheck(pathOverride?: string, silent = false) {
    const path = pathOverride || previewPath;
    if (!silent) {
      setStatusMessage(null);
      setNotice(null);
    }

    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const res = await edgeFetch(`/api/admin/preview-parse?path=${encodeURIComponent(path)}`);
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        const message = getApiErrorMessage(body, 'Parser-Prüfung fehlgeschlagen');
        setPreviewError(message);
        setPreviewResult(null);
        if (!silent) setNotice(message);
        return;
      }

      setPreviewResult((body?.data || null) as PreviewData | null);
      if (!silent) setStatusMessage('Parser-Prüfung erfolgreich.');
    } finally {
      setPreviewLoading(false);
    }
  }

  const machinesByParkId = machineConfigs.reduce<Record<string, LiftpicMachineConfig[]>>((map, item) => {
    if (!map[item.park_id]) map[item.park_id] = [];
    map[item.park_id].push(item);
    return map;
  }, {});

  const ticketsByParkId = tickets.reduce<Record<string, SupportTicket[]>>((map, item) => {
    if (!map[item.organization_id]) map[item.organization_id] = [];
    map[item.organization_id].push(item);
    return map;
  }, {});

  const parkRows = parks.map((park) =>
    buildParkRow(
      park,
      dashboardByParkId[park.id]?.data || null,
      dashboardByParkId[park.id]?.error || null,
      machinesByParkId[park.id] || [],
      ticketsByParkId[park.id] || [],
      attractionNameById,
    ),
  );

  const trimmedQuery = query.trim().toLowerCase();
  const filteredRows = [...parkRows]
    .filter((row) => {
      if (statusFilter === 'attention' && row.status === 'operational') return false;
      if (statusFilter === 'critical' && row.status !== 'down') return false;
      if (statusFilter === 'stable' && row.status !== 'operational') return false;
      if (trimmedQuery && !row.queryText.includes(trimmedQuery)) return false;
      return true;
    })
    .sort((left, right) => {
      if (sortKey === 'name') {
        return left.park.name.localeCompare(right.park.name, 'de');
      }

      if (sortKey === 'last_data') {
        const leftTime = left.lastDataAt ? new Date(left.lastDataAt).getTime() : 0;
        const rightTime = right.lastDataAt ? new Date(right.lastDataAt).getTime() : 0;
        return leftTime - rightTime;
      }

      if (sortKey === 'machines') {
        if (right.offlineMachines !== left.offlineMachines) return right.offlineMachines - left.offlineMachines;
        if (right.degradedMachines !== left.degradedMachines) return right.degradedMachines - left.degradedMachines;
        return left.park.name.localeCompare(right.park.name, 'de');
      }

      if (statusRank(right.status) !== statusRank(left.status)) {
        return statusRank(right.status) - statusRank(left.status);
      }

      if (right.alertCount !== left.alertCount) {
        return right.alertCount - left.alertCount;
      }

      return left.park.name.localeCompare(right.park.name, 'de');
    });

  const monitoredCustomers = parkRows.length;
  const customersWithAttention = parkRows.filter((row) => row.status !== 'operational').length;
  const criticalCustomers = parkRows.filter((row) => row.status === 'down').length;
  const offlineMachines = parkRows.reduce((sum, row) => sum + row.offlineMachines, 0);
  const unstableMachines = parkRows.reduce((sum, row) => sum + row.degradedMachines, 0);
  const totalMachines = parkRows.reduce((sum, row) => sum + row.machines.length, 0);
  const openSupportTickets = parkRows.reduce((sum, row) => sum + row.tickets.length, 0);
  const criticalSignals = parkRows.reduce(
    (sum, row) => sum + row.reasons.filter((reason) => reason.status === 'down').length,
    0,
  );
  const dashboardFailures = parkRows.filter((row) => row.dashboardError).length;
  const healthyDashboardCount = monitoredCustomers - dashboardFailures;

  const globalServices: HealthServiceSummary[] = [
    {
      label: 'Admin-Datenbank',
      status: adminDatabaseHealth?.status || 'degraded',
      detail: adminDatabaseHealth
        ? adminDatabaseHealth.error
          ? `${adminDatabaseHealth.projectRef} · keine Verbindung`
          : `${adminDatabaseHealth.projectRef} · ${adminDatabaseHealth.latencyMs ?? '-'} ms`
        : `${STAFF_PROJECT_REF} · wird geprüft`,
    },
    {
      label: 'Health Feed',
      status:
        dashboardFailures === 0
          ? 'operational'
          : healthyDashboardCount > 0
            ? 'degraded'
            : 'down',
      detail: `${healthyDashboardCount}/${monitoredCustomers || 0} live`,
    },
    {
      label: 'Liftpic Sync',
      status:
        offlineMachines > 0
          ? 'down'
          : unstableMachines > 0
            ? 'degraded'
            : totalMachines > 0
              ? 'operational'
              : 'degraded',
      detail: `${totalMachines - offlineMachines}/${totalMachines || 0} online`,
    },
    {
      label: 'Support',
      status: openSupportTickets === 0 ? 'operational' : criticalCustomers > 0 ? 'degraded' : 'degraded',
      detail: `${openSupportTickets} offen`,
    },
    {
      label: 'Parser',
      status: previewError ? 'down' : previewResult ? 'operational' : previewLoading ? 'degraded' : 'degraded',
      detail: previewResult?.matchedParkName || (previewLoading ? 'wird geprüft' : 'bereit'),
    },
    {
      label: 'Kundenbestand',
      status: monitoredCustomers > 0 ? 'operational' : 'degraded',
      detail: `${monitoredCustomers} Kunden · ${totalMachines} PCs`,
    },
  ];

  const incidents = [
    ...(adminDatabaseHealth && adminDatabaseHealth.status !== 'operational'
      ? [{
          parkId: '',
          parkName: 'LiftPictures Admin',
          severity: adminDatabaseHealth.status,
          title: 'Admin-Datenbank',
          detail: adminDatabaseHealth.error || `${adminDatabaseHealth.projectRef} · ${adminDatabaseHealth.latencyMs ?? '-'} ms`,
          occurredAt: adminDatabaseHealth.checkedAt,
        }]
      : []),
    ...parkRows.flatMap((row) =>
      row.reasons.map((reason) => ({
        parkId: row.park.id,
        parkName: row.park.name,
        severity: reason.status,
        title: reason.label,
        detail:
          row.status === 'down'
            ? `${row.offlineMachines} offline · ${row.tickets.length} Support`
            : `${row.onlineMachines}/${row.machines.length} PCs online`,
        occurredAt: row.lastDataAt || row.lastActivityAt,
      })),
    ),
  ]
    .sort((left, right) => {
      if (statusRank(right.severity) !== statusRank(left.severity)) {
        return statusRank(right.severity) - statusRank(left.severity);
      }
      return (
        new Date(right.occurredAt || 0).getTime() -
        new Date(left.occurredAt || 0).getTime()
      );
    })
    .slice(0, 10);

  function openCustomer(parkId: string, section: 'health' | 'machines' | 'support', panel: 'details' | 'edit') {
    navigate(buildCustomerUrl(parkId, section, panel));
  }

  function scrollToParser() {
    document.getElementById('health-parser-check')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (loading) {
    return (
      <div className="customer-management-page">
        <div className="card customer-directory-shell health-shell">
          <div className="customer-directory-head health-page-head">
            <div>
              <h2>Health</h2>
            </div>
          </div>
          <div className="customer-inline-status">
            <p className="note">Health-Daten werden geladen...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="customer-management-page">
        <div className="card customer-directory-shell health-shell">
          <div className="customer-directory-head health-page-head">
            <div>
              <h2>Health</h2>
            </div>
          </div>
          <div className="customer-inline-status">
            <p className="error">{error}</p>
          </div>
          <div className="customer-row-actions">
            <button type="button" className="customer-open-btn" onClick={() => void loadOverview(true)}>
              <RefreshCw size={14} />
              Erneut laden
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-management-page">
      <div className="card customer-directory-shell health-shell">
        <div className="customer-directory-head health-page-head">
          <div>
            <h2>Health</h2>
          </div>
          <div className="health-head-actions">
            <button type="button" className="customer-toolbar-btn" onClick={scrollToParser}>
              <ScanSearch size={14} />
              Parser
            </button>
            <button type="button" className="customer-open-btn" onClick={() => void loadOverview(true)} disabled={refreshing}>
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
              {refreshing ? 'Aktualisiert...' : 'Aktualisieren'}
            </button>
          </div>
        </div>

        <div className="customer-overview-grid health-summary-grid">
          <div className="customer-overview-item health-summary-item">
            <span>Kunden</span>
            <strong>{monitoredCustomers}</strong>
          </div>
          <div className="customer-overview-item health-summary-item">
            <span>Mit Alarm</span>
            <strong>{customersWithAttention}</strong>
          </div>
          <div className="customer-overview-item health-summary-item">
            <span>Kritisch</span>
            <strong>{criticalCustomers}</strong>
          </div>
          <div className="customer-overview-item health-summary-item">
            <span>PCs offline</span>
            <strong>{offlineMachines}</strong>
            <p className="note">{unstableMachines > 0 ? `${unstableMachines} wackelig` : 'keine Wackler'}</p>
          </div>
          <div className="customer-overview-item health-summary-item">
            <span>Support offen</span>
            <strong>{openSupportTickets}</strong>
            <p className="note">{criticalSignals} kritische Signale</p>
          </div>
        </div>

        <div className="customer-directory-toolbar health-toolbar">
          <label className="customer-directory-search">
            <Search size={16} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Suche nach Kunde, PC, Fehler oder Hinweis..."
            />
          </label>

          <div className="health-toolbar-actions">
            <div className="health-filter-switch" role="tablist" aria-label="Health-Filter">
              <button type="button" className={`customer-quiet-btn health-filter-btn ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
                Alle
              </button>
              <button type="button" className={`customer-quiet-btn health-filter-btn ${statusFilter === 'attention' ? 'active' : ''}`} onClick={() => setStatusFilter('attention')}>
                Mit Alarm
              </button>
              <button type="button" className={`customer-quiet-btn health-filter-btn ${statusFilter === 'critical' ? 'active' : ''}`} onClick={() => setStatusFilter('critical')}>
                Kritisch
              </button>
              <button type="button" className={`customer-quiet-btn health-filter-btn ${statusFilter === 'stable' ? 'active' : ''}`} onClick={() => setStatusFilter('stable')}>
                Stabil
              </button>
            </div>

            <label className="health-sort-control" aria-label="Sortieren nach">
              <span className="health-sort-icon">
                <ArrowUpDown size={14} />
              </span>
              <select
                className="health-sort-select"
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {(notice || statusMessage) && (
          <div className="customer-inline-status" aria-live="polite">
            {statusMessage && <p className="success">{statusMessage}</p>}
            {notice && <p className="note">{notice}</p>}
          </div>
        )}

        <div className="health-service-strip">
          {globalServices.map((item) => (
            <div key={item.label} className={`health-service-card ${item.status}`}>
              <div className="health-service-state">
                <span className={`health-service-dot ${item.status === 'down' ? 'pulse' : ''}`} />
                <strong>{item.label}</strong>
              </div>
              <span className={`health-status-pill ${item.status}`}>{statusLabel(item.status)}</span>
              <small>{item.detail}</small>
            </div>
          ))}
        </div>

        <div className="customer-simple-card health-alert-board">
          <div className="customer-inline-head">
            <div>
              <strong>Auffällig</strong>
              <small>{incidents.length > 0 ? `${incidents.length} direkte Punkte` : 'Aktuell ruhig'}</small>
            </div>
          </div>

          {incidents.length === 0 ? (
            <p className="note">Keine akuten Auffälligkeiten.</p>
          ) : (
            <div className="health-alert-list">
              {incidents.map((item, index) => (
                <div key={`${item.parkId}:${item.title}:${index}`} className="health-alert-row">
                  <div className="health-alert-copy">
                    <span className={`health-status-pill ${item.severity}`}>{statusLabel(item.severity)}</span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.parkName} · {item.detail}
                    </small>
                  </div>
                  <div className="health-alert-meta">
                    <span className="note">{formatRelative(item.occurredAt)}</span>
                    {item.parkId ? (
                      <button
                        type="button"
                        className="customer-quiet-btn"
                        onClick={() => openCustomer(item.parkId, 'health', 'details')}
                      >
                        Öffnen
                      </button>
                    ) : (
                      <button type="button" className="customer-quiet-btn" onClick={() => void loadOverview(true)}>
                        Prüfen
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="customer-inline-head health-section-head">
          <div>
            <strong>Kunden & Systeme</strong>
            <small>{filteredRows.length} in der Ansicht</small>
          </div>
        </div>

        {filteredRows.length > 0 ? (
          <div className="customer-directory-list health-customer-list">
            {filteredRows.map((row) => {
              const isOpen = openParkId === row.park.id;
              return (
                <article key={row.park.id} className={`customer-row-card health-customer-row ${isOpen ? 'open' : ''}`}>
                  <div className="customer-row-main health-customer-row-main">
                    <div className="customer-row-content">
                      <div className="customer-row-head">
                        <div>
                          <h3>{row.park.name}</h3>
                          <p className="customer-row-slug">{row.park.slug}</p>
                        </div>
                      </div>

                      <div className="customer-row-meta">
                        <span>{row.onlineMachines}/{row.machines.length || 0} PCs online</span>
                        <span>{row.tickets.length} Support offen</span>
                        <span>{formatRelative(row.lastDataAt)}</span>
                        <span>{formatRelative(row.lastActivityAt)}</span>
                      </div>

                      {row.reasons.length > 0 && (
                        <div className="health-chip-list">
                          {row.reasons.slice(0, 4).map((reason) => (
                            <span key={reason.label} className={`health-chip ${reason.status}`}>
                              {reason.label}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="customer-row-actions">
                        <button type="button" className="customer-open-btn" onClick={() => setOpenParkId(isOpen ? null : row.park.id)}>
                          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          Details
                        </button>
                        <button type="button" className="customer-quiet-btn" onClick={() => openCustomer(row.park.id, 'health', 'details')}>
                          <ExternalLink size={14} />
                          Kunde
                        </button>
                      </div>
                    </div>

                    <aside className="customer-row-side health-customer-side">
                      <span className={`health-status-pill ${row.status}`}>{row.statusLabel}</span>
                      <div className="health-side-stack">
                        <strong>{row.alertCount}</strong>
                        <small>Signale</small>
                      </div>
                    </aside>
                  </div>

                  {isOpen && (
                    <div className="customer-expand-wrap">
                      <div className="customer-overview-grid health-detail-summary">
                        <div className="customer-overview-item">
                          <span>Letzte Daten</span>
                          <strong>{formatRelative(row.lastDataAt)}</strong>
                        </div>
                        <div className="customer-overview-item">
                          <span>Letzte Aktivität</span>
                          <strong>{formatRelative(row.lastActivityAt)}</strong>
                        </div>
                        <div className="customer-overview-item">
                          <span>Papier</span>
                          <strong>{row.paperRemaining ?? '-'}</strong>
                        </div>
                        <div className="customer-overview-item">
                          <span>Services</span>
                          <strong>{row.services.length}</strong>
                        </div>
                      </div>

                      <div className="health-detail-grid">
                        <div className="customer-simple-card health-detail-card">
                          <div className="customer-inline-head">
                            <div>
                              <strong>Systeme</strong>
                              <small>{row.services.length} live</small>
                            </div>
                          </div>

                          {row.services.length === 0 ? (
                            <p className="note">Keine Service-Signale.</p>
                          ) : (
                            <div className="customer-simple-list">
                              {row.services.slice(0, 6).map((service) => {
                                const serviceStatus = normalizeHealthStatus(service.status);
                                return (
                                  <div key={`${row.park.id}:${service.name}`} className="customer-simple-list-row health-service-row">
                                    <div className="health-service-row-copy">
                                      <strong>{service.name}</strong>
                                      <small>
                                        {service.detail || 'ohne Detail'} · {formatRelative(service.last_seen_at || row.lastDataAt)}
                                      </small>
                                    </div>
                                    <span className={`health-status-pill ${serviceStatus}`}>{statusLabel(serviceStatus)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="customer-simple-card health-detail-card">
                          <div className="customer-inline-head">
                            <div>
                              <strong>Liftpic PCs</strong>
                              <small>{row.machines.length} hinterlegt</small>
                            </div>
                          </div>

                          {row.machines.length === 0 ? (
                            <p className="note">Kein PC hinterlegt.</p>
                          ) : (
                            <div className="customer-simple-list">
                              {row.machines.map((machine) => (
                                <div key={machine.id} className="customer-simple-list-row health-machine-row">
                                  <div className="health-machine-main">
                                    <strong>{machine.label}</strong>
                                    <small>
                                      {machine.machineId}
                                      {machine.attractionName ? ` · ${machine.attractionName}` : ''}
                                      {' · '}
                                      {formatDateTime(machine.lastSeenAt)}
                                    </small>
                                    {machine.notes.length > 0 && (
                                      <div className="health-chip-list health-chip-list-compact">
                                        {machine.notes.map((note) => (
                                          <span key={`${machine.id}:${note}`} className={`health-chip ${machine.status}`}>
                                            {note}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="health-machine-actions">
                                    <span className={`health-status-pill ${machine.status}`}>{statusLabel(machine.status)}</span>
                                    {machine.pairingStatus !== 'paired' && (
                                      <button
                                        type="button"
                                        className="customer-quiet-btn"
                                        onClick={() => void regeneratePairingCode(machine)}
                                        disabled={pairingMachineId === machine.id}
                                      >
                                        {pairingMachineId === machine.id ? 'Läuft...' : 'Neu koppeln'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="customer-simple-card health-detail-card">
                          <div className="customer-inline-head">
                            <div>
                              <strong>Support & Ereignisse</strong>
                              <small>{row.tickets.length + row.events.length} Einträge</small>
                            </div>
                          </div>

                          <div className="health-event-stack">
                            {row.tickets.slice(0, 3).map((ticketItem) => (
                              <div key={ticketItem.id} className="health-event-row">
                                <div className="health-event-copy">
                                  <span className={`health-status-pill ${ticketItem.priority === 'critical' ? 'down' : 'degraded'}`}>
                                    {ticketItem.priority === 'critical' ? 'Kritisch' : 'Support'}
                                  </span>
                                  <strong>{ticketItem.subject}</strong>
                                  <small>{formatDateTime(ticketItem.created_at)}</small>
                                </div>
                              </div>
                            ))}

                            {row.events.slice(0, 4).map((event) => {
                              const eventStatus = severityStatus(event);
                              return (
                                <div key={event.id} className="health-event-row">
                                  <div className="health-event-copy">
                                    <span className={`health-status-pill ${eventStatus}`}>{event.severity}</span>
                                    <strong>{event.description}</strong>
                                    <small>
                                      {event.category} · {formatDateTime(event.occurred_at)}
                                    </small>
                                  </div>
                                </div>
                              );
                            })}

                            {row.tickets.length === 0 && row.events.length === 0 && (
                              <p className="note">Keine offenen Support-Fälle und keine aktuellen Meldungen.</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="customer-row-actions health-detail-actions">
                        <button
                          type="button"
                          className="customer-quiet-btn"
                          onClick={() => void refreshPark(row.park.id)}
                          disabled={refreshingParkId === row.park.id}
                        >
                          <RefreshCw size={14} className={refreshingParkId === row.park.id ? 'spin' : ''} />
                          {refreshingParkId === row.park.id ? 'Aktualisiert...' : 'Neu laden'}
                        </button>
                        <button type="button" className="customer-quiet-btn" onClick={() => openCustomer(row.park.id, 'machines', 'edit')}>
                          <Monitor size={14} />
                          Maschinen
                        </button>
                        <button type="button" className="customer-quiet-btn" onClick={() => openCustomer(row.park.id, 'support', 'edit')}>
                          <LifeBuoy size={14} />
                          Support
                        </button>
                        <button type="button" className="customer-quiet-btn" onClick={() => showRestartHint(row)}>
                          <Unplug size={14} />
                          Neustart-Hinweis
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="customer-simple-card health-empty-card">
            <strong>Keine Treffer</strong>
            <small>Mit den aktuellen Filtern wurde nichts gefunden.</small>
          </div>
        )}

        <div id="health-parser-check" className="customer-simple-card health-parser-card">
          <div className="customer-inline-head">
            <div>
              <strong>Parser & Ingestion</strong>
              <small>Prefix, Code und Kunden-Mapping direkt prüfen.</small>
            </div>
          </div>

          <form className="health-parser-form" onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void runPreviewCheck();
          }}>
            <div>
              <label>Storage Path</label>
              <input value={previewPath} onChange={(event) => setPreviewPath(event.target.value)} required />
            </div>
            <button type="submit" className="customer-open-btn" disabled={previewLoading}>
              <ScanSearch size={14} />
              {previewLoading ? 'Prüft...' : 'Prüfen'}
            </button>
          </form>

          {previewError && <p className="error">{previewError}</p>}

          {previewResult && (
            <div className="customer-overview-grid health-preview-grid">
              <div className="customer-overview-item">
                <span>Prefix</span>
                <strong>{previewResult.prefix || '-'}</strong>
              </div>
              <div className="customer-overview-item">
                <span>Kunde</span>
                <strong>{previewResult.matchedParkName || '-'}</strong>
              </div>
              <div className="customer-overview-item">
                <span>Attraktion</span>
                <strong>{previewResult.matchedAttractionName || '-'}</strong>
              </div>
              <div className="customer-overview-item">
                <span>Code</span>
                <strong>{previewResult.customerCode || previewResult.legacyCustomerCode || '-'}</strong>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
