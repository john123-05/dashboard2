import { useEffect, useMemo, useState } from 'react';
import { Clock3, Download, Globe2, Mail, Sparkles, Trash2, UserPlus, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getOptionalSourceWarning, invokeEdgeFunction, isEdgeSourceUnavailable } from '../lib/edgeFunctions';
import { formatDate, formatNumber, exportToCSV } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import DataTable from '../components/ui/DataTable';
import { useI18n } from '../lib/i18n';
import { usePark } from '../contexts/ParkContext';

type CountryStat = {
  countryCode: string;
  countryName: string;
  count: number;
  x: number | null;
  y: number | null;
};

type HourBucket = {
  hour: number;
  count: number;
  label: string;
};

const COUNTRY_COORDINATES: Record<string, { x: number; y: number }> = {
  AR: { x: 32, y: 75 },
  AT: { x: 52, y: 34 },
  AU: { x: 85, y: 74 },
  BE: { x: 48, y: 31 },
  BG: { x: 56, y: 38 },
  BR: { x: 30, y: 63 },
  CA: { x: 20, y: 24 },
  CH: { x: 50, y: 34 },
  CN: { x: 74, y: 38 },
  CZ: { x: 53, y: 32 },
  DE: { x: 51, y: 30 },
  DK: { x: 50, y: 27 },
  EE: { x: 56, y: 23 },
  ES: { x: 46, y: 40 },
  FI: { x: 56, y: 18 },
  FR: { x: 47, y: 33 },
  GB: { x: 46, y: 24 },
  GR: { x: 56, y: 42 },
  HR: { x: 54, y: 37 },
  HU: { x: 54, y: 35 },
  IE: { x: 43, y: 25 },
  IN: { x: 69, y: 49 },
  IT: { x: 52, y: 38 },
  JP: { x: 82, y: 35 },
  KR: { x: 79, y: 34 },
  LT: { x: 55, y: 25 },
  LU: { x: 48, y: 30 },
  LV: { x: 55, y: 24 },
  MX: { x: 16, y: 42 },
  NL: { x: 48, y: 29 },
  NO: { x: 50, y: 19 },
  NZ: { x: 91, y: 81 },
  PL: { x: 55, y: 30 },
  PT: { x: 43, y: 40 },
  RO: { x: 57, y: 36 },
  SE: { x: 53, y: 21 },
  SI: { x: 53, y: 35 },
  SK: { x: 55, y: 33 },
  TR: { x: 61, y: 39 },
  US: { x: 18, y: 33 },
  ZA: { x: 56, y: 78 },
};

const WORLD_LANDMASSES = [
  'M78 120C55 111 46 89 56 66C67 43 108 32 144 44C162 50 173 63 174 79C175 95 163 112 145 122C131 129 117 136 101 137C91 137 84 133 78 120Z',
  'M146 143C159 147 168 158 170 176C172 195 166 213 159 230C153 245 145 262 136 280C130 292 121 297 113 292C104 286 103 271 107 257C111 242 119 227 123 211C126 199 125 188 123 177C121 164 128 151 146 143Z',
  'M317 101C332 84 359 77 381 82C398 85 407 96 409 111C411 123 403 132 391 139C381 145 370 149 358 147C343 144 327 135 318 122C314 116 313 108 317 101Z',
  'M332 147C345 142 362 146 375 156C390 168 401 186 405 210C409 235 403 258 391 274C381 287 366 294 351 289C336 284 327 269 325 252C322 231 326 213 333 196C338 183 339 168 332 147Z',
  'M406 106C436 77 488 66 542 73C576 77 608 93 628 116C648 139 650 164 637 182C624 200 597 210 570 207C544 205 525 211 510 223C494 236 471 241 447 234C422 226 405 209 399 187C393 166 395 136 406 106Z',
  'M594 231C613 223 636 228 651 241C667 255 670 275 660 291C650 307 629 315 608 311C587 307 572 292 571 274C570 257 578 239 594 231Z',
];

function getCountryName(countryCode: string): string {
  try {
    const displayNames = new Intl.DisplayNames(['de'], { type: 'region' });
    return displayNames.of(countryCode) || countryCode;
  } catch {
    return countryCode;
  }
}

function formatHourRange(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00 - ${String(hour).padStart(2, '0')}:59`;
}

function CompactMetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconClassName,
  iconWrapClassName,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof UserPlus;
  iconClassName: string;
  iconWrapClassName: string;
}) {
  return (
    <GlassCard className="h-full p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</p>
          <p className="text-3xl font-bold tracking-tight text-slate-800">{value}</p>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className={`rounded-2xl p-3 ${iconWrapClassName}`}>
          <Icon className={`h-5 w-5 ${iconClassName}`} />
        </div>
      </div>
    </GlassCard>
  );
}

function LeadWorldMap({
  points,
  selectedCountry,
  onSelectCountry,
  compact = false,
}: {
  points: CountryStat[];
  selectedCountry: string | null;
  onSelectCountry: (countryCode: string) => void;
  compact?: boolean;
}) {
  const visiblePoints = points.filter((point) => point.x !== null && point.y !== null);
  const maxCount = Math.max(...visiblePoints.map((point) => point.count), 1);

  return (
    <div className={`relative overflow-hidden rounded-[28px] border border-slate-100 bg-slate-50/80 ${compact ? 'h-[220px]' : 'h-[360px]'}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.08),_transparent_32%)]" />
      <svg viewBox="0 0 720 360" className="relative h-full w-full">
        {WORLD_LANDMASSES.map((path, index) => (
          <path
            key={index}
            d={path}
            transform="translate(0 6) scale(1.03 1.03)"
            fill="#E2E8F0"
            stroke="#CBD5E1"
            strokeWidth="1.5"
            opacity="0.95"
          />
        ))}

        {visiblePoints.map((point) => {
          const isSelected = point.countryCode === selectedCountry;
          const radius = 6 + (point.count / maxCount) * (compact ? 8 : 12);
          return (
            <g
              key={point.countryCode}
              onClick={() => onSelectCountry(point.countryCode)}
              className="cursor-pointer"
            >
              <circle cx={`${point.x}%`} cy={`${point.y}%`} r={radius + 6} fill="rgba(14, 165, 233, 0.10)" />
              <circle
                cx={`${point.x}%`}
                cy={`${point.y}%`}
                r={radius}
                fill={isSelected ? '#2563EB' : '#3B82F6'}
                stroke="rgba(255,255,255,0.92)"
                strokeWidth="3"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function countryCodeToFlag(countryCode: string | null | undefined): string {
  if (!countryCode || !/^[A-Za-z]{2}$/.test(countryCode)) return '';
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function leadLocaleBadge(item: Record<string, unknown>): string | null {
  const locale = typeof item.locale === 'string' ? item.locale.trim().toUpperCase() : '';
  const countryCode = typeof item.country_code === 'string' ? item.country_code.trim().toUpperCase() : '';
  const flag = countryCodeToFlag(countryCode);
  const parts = [flag, locale, countryCode].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

export default function Leads() {
  const { t } = useI18n();
  const { parkId } = usePark();
  const [leads, setLeads] = useState<Record<string, unknown>[]>([]);
  const [sourceData, setSourceData] = useState<{ source: string; count: number }[]>([]);
  const [stats, setStats] = useState({ total: 0, optedIn: 0 });
  const [filterOptIn, setFilterOptIn] = useState<boolean | null>(null);
  const [countryFilter, setCountryFilter] = useState('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadData();
  }, [parkId]);

  async function loadData() {
    setLoading(true);
    const { data, error: invokeError } = await invokeEdgeFunction('external-leads', {
      query: { park_id: parkId || undefined },
    });

    if (invokeError) {
      console.error('Failed to fetch external leads:', invokeError);
      if (isEdgeSourceUnavailable(invokeError)) {
        setLeads([]);
        setStats({ total: 0, optedIn: 0 });
        setSourceData([]);
        setNotice(getOptionalSourceWarning('Lead feed', invokeError));
        setError(null);
        setLoading(false);
        return;
      }
      setError(invokeError);
      setLoading(false);
      return;
    }

    const leads = data?.leads || [];

    const rows: Record<string, unknown>[] = (leads || []).map((l: Record<string, unknown>) => {
      const park = l.park as Record<string, unknown> | null;
      return {
        ...l,
        park_name: (park?.name as string) || (l.park_name as string) || 'Unknown',
      };
    });

    setLeads(rows);
    setStats({
      total: rows.length,
      optedIn: rows.filter((l) => l.opted_in === true).length,
    });

    const bySource = new Map<string, number>();
    rows.forEach((l) => {
      const src = String(l.source || 'unknown');
      bySource.set(src, (bySource.get(src) || 0) + 1);
    });
    setSourceData(
      Array.from(bySource.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
    );

    setError(null);
    setNotice(null);
    setSelectedLeadIds([]);
    setLoading(false);
  }

  const filtered = leads.filter((lead) => {
    if (filterOptIn !== null && lead.opted_in !== filterOptIn) return false;
    if (countryFilter !== 'all') {
      const rowCountry = typeof lead.country_code === 'string' ? lead.country_code.trim().toUpperCase() : '';
      if (rowCountry !== countryFilter) return false;
    }
    return true;
  });

  const countryOptions = useMemo(() => {
    return [...new Set(
      leads
        .map((lead) => (typeof lead.country_code === 'string' ? lead.country_code.trim().toUpperCase() : ''))
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const countryStats = useMemo<CountryStat[]>(() => {
    const counts = new Map<string, number>();
    leads.forEach((lead) => {
      const countryCode = typeof lead.country_code === 'string' ? lead.country_code.trim().toUpperCase() : '';
      if (!countryCode) return;
      counts.set(countryCode, (counts.get(countryCode) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([countryCode, count]) => ({
        countryCode,
        countryName: getCountryName(countryCode),
        count,
        x: COUNTRY_COORDINATES[countryCode]?.x ?? null,
        y: COUNTRY_COORDINATES[countryCode]?.y ?? null,
      }))
      .sort((a, b) => b.count - a.count || a.countryName.localeCompare(b.countryName));
  }, [leads]);

  const topCountries = countryStats.slice(0, 6);

  const hourlyData = useMemo<HourBucket[]>(() => {
    const counts = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, label: `${String(hour).padStart(2, '0')}:00` }));
    leads.forEach((lead) => {
      const createdAt = typeof lead.created_at === 'string' ? lead.created_at : '';
      const date = createdAt ? new Date(createdAt) : null;
      if (!date || Number.isNaN(date.getTime())) return;
      counts[date.getHours()].count += 1;
    });
    return counts;
  }, [leads]);

  const peakHour = useMemo(
    () => hourlyData.reduce((best, bucket) => (bucket.count > best.count ? bucket : best), hourlyData[0] || { hour: 0, count: 0, label: '00:00' }),
    [hourlyData],
  );

  const leadsWithTimestamps = useMemo(
    () =>
      leads
        .map((lead) => {
          const createdAt = typeof lead.created_at === 'string' ? lead.created_at : '';
          const date = createdAt ? new Date(createdAt) : null;
          return date && !Number.isNaN(date.getTime()) ? date : null;
        })
        .filter((date): date is Date => date !== null),
    [leads],
  );

  const latestLeadLabel = useMemo(() => {
    const latestLead = leadsWithTimestamps.reduce<Date | null>((latest, current) => {
      if (!latest || current.getTime() > latest.getTime()) return current;
      return latest;
    }, null);

    if (!latestLead) return 'Noch keine Zeitdaten';
    return latestLead.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [leadsWithTimestamps]);

  const optInRate = stats.total > 0 ? Math.round((stats.optedIn / stats.total) * 100) : 0;

  function isDeletableLead(lead: Record<string, unknown>) {
    return lead.source === 'photo_claim' && typeof lead.id === 'string' && lead.id.length > 0;
  }

  function toggleLeadSelection(leadId: string) {
    setSelectedLeadIds((current) =>
      current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId],
    );
  }

  function toggleSelectionMode() {
    setSelectionMode((current) => {
      if (current) setSelectedLeadIds([]);
      return !current;
    });
  }

  function toggleVisibleSelection() {
    const visibleIds = filtered
      .filter(isDeletableLead)
      .map((lead) => String(lead.id));
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedLeadIds.includes(id));
    setSelectedLeadIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !visibleIds.includes(id));
      return [...new Set([...current, ...visibleIds])];
    });
  }

  async function deleteLeadIds(ids: string[]) {
    if (!parkId || ids.length === 0) return;
    const plural = ids.length > 1;
    if (!confirm(plural ? `${ids.length} E-Mail-Leads wirklich löschen?` : 'Diesen E-Mail-Lead wirklich löschen?')) {
      return;
    }

    setDeleting(true);
    const { data, error: deleteError } = await invokeEdgeFunction<{ deletedIds?: string[] }>('external-leads', {
      method: 'DELETE',
      body: { park_id: parkId, ids },
      useSessionAuth: true,
    });

    if (deleteError) {
      setError(deleteError);
      setDeleting(false);
      return;
    }

    const deletedIds = Array.isArray(data?.deletedIds) ? data.deletedIds : ids;
    setLeads((current) => current.filter((lead) => !deletedIds.includes(String(lead.id ?? ''))));
    setSelectedLeadIds((current) => current.filter((id) => !deletedIds.includes(id)));
    setDeleting(false);
  }

  function handleExport() {
    exportToCSV(
        filtered.map((l) => ({
          email: l.email as string,
          name: (l.full_name as string) || '',
          source: l.source as string,
          opted_in: l.opted_in ? t('leads.opted_in') : t('leads.opted_out'),
          park: l.park_name as string,
          locale: typeof l.locale === 'string' ? l.locale : '',
          country_code: typeof l.country_code === 'string' ? l.country_code : '',
          date: l.created_at as string,
        })),
      'leads-export'
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/40" />
        <div className="grid gap-6 sm:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/30" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('leads.title')}</h2>
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Leads</h3>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button onClick={loadData} className="glass-button-secondary">
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  }

  const selectedCountryStat =
    countryStats.find((country) => country.countryCode === selectedCountry) || topCountries[0] || null;
  const totalMappedLeads = countryStats.reduce((sum, country) => sum + country.count, 0);
  const topSourceData = sourceData.slice(0, 4);

  const columns = [
    ...(selectionMode ? [{
      key: 'select',
      label: (
        <input
          type="checkbox"
          checked={filtered.filter(isDeletableLead).length > 0 && filtered.filter(isDeletableLead).every((lead) => selectedLeadIds.includes(String(lead.id)))}
          onChange={toggleVisibleSelection}
          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          aria-label="Alle sichtbaren Leads auswählen"
        />
      ),
      className: 'w-12',
      render: (item: Record<string, unknown>) => {
        if (!isDeletableLead(item)) return null;
        const leadId = String(item.id);
        return (
          <input
            type="checkbox"
            checked={selectedLeadIds.includes(leadId)}
            onChange={() => toggleLeadSelection(leadId)}
            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            aria-label={`Lead ${item.email as string} auswählen`}
          />
        );
      },
    }] : []),
    {
      key: 'email',
      label: t('leads.table.email'),
      render: (item: Record<string, unknown>) => {
        const localeBadge = leadLocaleBadge(item);
        return (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{item.email as string}</span>
            {localeBadge && (
              <span className="inline-flex w-fit rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200">
                {localeBadge}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'full_name',
      label: t('leads.table.name'),
      render: (item: Record<string, unknown>) => (
        <span>{(item.full_name as string) || '-'}</span>
      ),
    },
    {
      key: 'park_name',
      label: t('leads.table.park'),
    },
    {
      key: 'source',
      label: t('leads.table.source'),
      render: (item: Record<string, unknown>) => (
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {item.source as string}
        </span>
      ),
    },
    {
      key: 'opted_in',
      label: t('leads.table.opted_in'),
      render: (item: Record<string, unknown>) => (
        <span
          className={`status-badge ${
            item.opted_in
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-slate-50 text-slate-500 ring-slate-200'
          }`}
        >
          {item.opted_in ? t('leads.opted_in') : t('leads.opted_out')}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: t('leads.table.date'),
      render: (item: Record<string, unknown>) => (
        <span className="text-slate-500">{formatDate(item.created_at as string)}</span>
      ),
    },
    {
      key: 'actions',
      label: '',
      className: 'w-14 text-right',
      render: (item: Record<string, unknown>) => {
        if (!isDeletableLead(item)) return null;
        return (
          <button
            type="button"
            onClick={() => deleteLeadIds([String(item.id)])}
            disabled={deleting}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
            title="Lead löschen"
            aria-label={`Lead ${item.email as string} löschen`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('leads.title')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('leads.subtitle')}</p>
        </div>
        <button onClick={handleExport} className="glass-button-secondary">
          <Download className="h-4 w-4" />
          {t('leads.export')}
        </button>
      </div>

      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
        <p className="text-sm text-sky-900">{t('leads.explainer')}</p>
      </div>

      {notice && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Lead data is currently unavailable.</p>
          <p className="mt-1 text-sm text-amber-700">{notice}</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="grid gap-6 xl:col-span-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <CompactMetricCard
              title={t('leads.total')}
              value={formatNumber(stats.total)}
              subtitle={`${countryStats.length} Länder erkannt`}
              icon={UserPlus}
              iconClassName="text-sky-600"
              iconWrapClassName="bg-sky-50"
            />
            <CompactMetricCard
              title={t('leads.optins')}
              value={formatNumber(stats.optedIn)}
              subtitle={`${optInRate}% Opt-in-Quote`}
              icon={Mail}
              iconClassName="text-emerald-600"
              iconWrapClassName="bg-emerald-50"
            />
          </div>

          <GlassCard className="p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Leads nach Quelle</p>
                <h3 className="mt-2 text-base font-semibold text-slate-800">Welche Wege am meisten bringen</h3>
              </div>
              <div className="rounded-2xl bg-sky-50 p-3">
                <Sparkles className="h-5 w-5 text-sky-600" />
              </div>
            </div>

            <div className="space-y-4">
              {topSourceData.map((entry) => {
                const share = stats.total > 0 ? Math.round((entry.count / stats.total) * 100) : 0;
                return (
                  <div key={entry.source} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{entry.source}</span>
                      <span className="text-slate-500">
                        {entry.count} <span className="text-slate-400">({share}%)</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-500"
                        style={{ width: `${Math.max(share, entry.count > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Beste Uhrzeiten</p>
                <h3 className="mt-2 text-base font-semibold text-slate-800">Wann Besucher ihre E-Mail abgeben</h3>
              </div>
              <div className="rounded-2xl bg-amber-50 p-3">
                <Clock3 className="h-5 w-5 text-amber-600" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-white/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Stärkste Stunde</p>
                <p className="mt-2 text-lg font-semibold text-slate-800">{formatHourRange(peakHour.hour)}</p>
                <p className="mt-1 text-sm text-slate-500">{peakHour.count} Leads in diesem Zeitfenster</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Letzte Abgabe</p>
                <p className="mt-2 text-lg font-semibold text-slate-800">{latestLeadLabel}</p>
                <p className="mt-1 text-sm text-slate-500">Zeitpunkt der zuletzt erkannten E-Mail</p>
              </div>
            </div>

            <div className="mt-4 h-28">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData}>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} interval={2} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(value: number) => [`${value} Leads`, 'Eingänge']}
                    labelFormatter={(label) => `${label} Uhr`}
                    contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(226,232,240,0.9)', borderRadius: '14px', boxShadow: '0 18px 40px rgba(15,23,42,0.08)' }}
                  />
                  <Bar dataKey="count" fill="#f59e0b" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </div>

        <GlassCard className="overflow-hidden xl:col-span-8">
          <div className="border-b border-slate-100/90 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-500">Deine Besucher kennenlernen</p>
            <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-800">Besucher nach Standort</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Die Punkte zeigen automatisch, aus welchen Ländern neue E-Mail-Adressen kommen.
                </p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-sky-800">
                <span className="font-semibold">{formatNumber(totalMappedLeads)}</span> Leads mit Land erkannt
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-[1.35fr_0.95fr]">
            <div>
              <LeadWorldMap
                points={countryStats}
                selectedCountry={selectedCountryStat?.countryCode || null}
                onSelectCountry={setSelectedCountry}
                compact
              />
              <button
                type="button"
                onClick={() => setShowLocationModal(true)}
                className="mt-4 text-sm font-medium text-sky-600 transition-colors hover:text-sky-700"
              >
                Detaillierte Karte anzeigen
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-[28px] border border-slate-100 bg-white/70 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Aktives Land</p>
                    <h4 className="mt-2 text-lg font-semibold text-slate-800">
                      {selectedCountryStat ? `${countryCodeToFlag(selectedCountryStat.countryCode)} ${selectedCountryStat.countryName}` : 'Noch keine Länder'}
                    </h4>
                  </div>
                  <div className="rounded-2xl bg-slate-100 p-3">
                    <Globe2 className="h-5 w-5 text-slate-500" />
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold tracking-tight text-slate-800">{selectedCountryStat?.count ?? 0}</p>
                    <p className="mt-1 text-sm text-slate-500">Leads aus diesem Land</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectedCountryStat && setCountryFilter(selectedCountryStat.countryCode)}
                    disabled={!selectedCountryStat}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-sky-200 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Im Filter öffnen
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {topCountries.map((country) => {
                  const share = totalMappedLeads > 0 ? Math.round((country.count / totalMappedLeads) * 100) : 0;
                  const active = country.countryCode === selectedCountryStat?.countryCode;
                  return (
                    <button
                      key={country.countryCode}
                      type="button"
                      onClick={() => setSelectedCountry(country.countryCode)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                        active
                          ? 'border-sky-200 bg-sky-50/80 shadow-sm'
                          : 'border-slate-100 bg-white/70 hover:border-slate-200 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-700">
                            {countryCodeToFlag(country.countryCode)} {country.countryName}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">{country.countryCode}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-800">{country.count}</p>
                          <p className="text-xs text-slate-400">{share}%</p>
                        </div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-500"
                          style={{ width: `${Math.max(share, country.count > 0 ? 10 : 0)}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        title={t('leads.title')}
        searchable
        searchKeys={['email', 'full_name', 'source', 'park_name', 'country_code', 'locale']}
        pageSize={10}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectionMode}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                selectionMode
                  ? 'border-sky-200 bg-sky-50 text-sky-700'
                  : 'border-slate-200/60 bg-white/60 text-slate-600 hover:bg-white/80'
              }`}
            >
              {selectionMode ? 'Fertig' : 'Auswählen'}
            </button>
            <select
              value={filterOptIn === null ? 'all' : filterOptIn ? 'yes' : 'no'}
              onChange={(e) => {
                const v = e.target.value;
                setFilterOptIn(v === 'all' ? null : v === 'yes');
              }}
              className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 text-sm text-slate-700"
            >
              <option value="all">{t('leads.all')}</option>
              <option value="yes">{t('leads.opted_in')}</option>
              <option value="no">{t('leads.opted_out')}</option>
            </select>
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 text-sm text-slate-700"
            >
              <option value="all">Alle Länder</option>
              {countryOptions.map((countryCode) => (
                <option key={countryCode} value={countryCode}>
                  {countryCodeToFlag(countryCode)} {countryCode}
                </option>
              ))}
            </select>
            {selectionMode && selectedLeadIds.length > 0 && (
              <button
                type="button"
                onClick={() => deleteLeadIds(selectedLeadIds)}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white/80 px-3 py-1.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {selectedLeadIds.length} löschen
              </button>
            )}
          </div>
        }
      />

      {showLocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-500">Besucher nach Standort</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-800">Detaillierte Weltkarte</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Klicke auf ein Land oder wähle rechts einen Eintrag aus, um die Leads gezielt anzusehen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLocationModal(false)}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                aria-label="Karte schließen"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid max-h-[calc(90vh-88px)] gap-6 overflow-y-auto p-6 lg:grid-cols-[1.6fr_0.8fr]">
              <div className="space-y-4">
                <LeadWorldMap
                  points={countryStats}
                  selectedCountry={selectedCountryStat?.countryCode || null}
                  onSelectCountry={setSelectedCountry}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Länder</p>
                    <p className="mt-2 text-2xl font-bold text-slate-800">{countryStats.length}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Leads mit Land</p>
                    <p className="mt-2 text-2xl font-bold text-slate-800">{formatNumber(totalMappedLeads)}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Stärkste Stunde</p>
                    <p className="mt-2 text-lg font-bold text-slate-800">{formatHourRange(peakHour.hour)}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {countryStats.map((country) => {
                  const share = totalMappedLeads > 0 ? Math.round((country.count / totalMappedLeads) * 100) : 0;
                  const active = country.countryCode === selectedCountryStat?.countryCode;
                  return (
                    <button
                      key={country.countryCode}
                      type="button"
                      onClick={() => setSelectedCountry(country.countryCode)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                        active
                          ? 'border-sky-200 bg-sky-50/80 shadow-sm'
                          : 'border-slate-100 bg-white hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-700">
                            {countryCodeToFlag(country.countryCode)} {country.countryName}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">{country.countryCode}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-800">{country.count}</p>
                          <p className="text-xs text-slate-400">{share}%</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
