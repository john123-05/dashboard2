import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Mail, Minus, Plus, Trash2, UserPlus } from 'lucide-react';
import { getOptionalSourceWarning, invokeEdgeFunction, isEdgeSourceUnavailable } from '../lib/edgeFunctions';
import { fetchKioskPhotosForDay, getClosingMinutesForDate, type KioskPurchaseRow } from '../lib/kioskSales';
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

type ClaimDelayMatch = {
  leadId: string;
  email: string;
  purchasedAt: Date;
  claimedAt: Date;
  delayMs: number;
  claimedAfterClose: boolean;
  claimedOnLaterDay: boolean;
  afterCloseMs: number | null;
};

type SvgViewBox = { minX: number; minY: number; width: number; height: number };

function getCountryName(countryCode: string): string {
  try {
    const displayNames = new Intl.DisplayNames(['de'], { type: 'region' });
    return displayNames.of(countryCode) || countryCode;
  } catch {
    return countryCode;
  }
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function localDateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function localMinutes(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDelay(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days} Tg ${hours} Std`;
  if (hours > 0) return `${hours} Std ${minutes} Min`;
  return `${minutes} Min`;
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
    <GlassCard className="h-full min-h-[146px] p-4">
      <div className="space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</p>
        <div className="flex items-center gap-3">
          <p className="text-[2rem] font-bold tracking-tight text-slate-800">{value}</p>
          <div className={`rounded-xl p-2 ${iconWrapClassName}`}>
            <Icon className={`h-4.5 w-4.5 ${iconClassName}`} />
          </div>
        </div>
        <p className="max-w-[10rem] text-sm leading-5 text-slate-500">{subtitle}</p>
      </div>
    </GlassCard>
  );
}

function buildWorldMapMarkup(svgSource: string, points: CountryStat[], selectedCountry: string | null): string {
  if (!svgSource) return '';

  const maxCount = Math.max(...points.map((point) => point.count), 1);
  const countryStyles = points
    .map((point) => {
      const intensity = point.count / maxCount;
      const fill = selectedCountry === point.countryCode
        ? '#2563EB'
        : intensity > 0.7
          ? '#60A5FA'
          : intensity > 0.35
            ? '#BFDBFE'
            : '#DBEAFE';
      return `#${point.countryCode.toLowerCase()} path{fill:${fill}!important;}`;
    })
    .join('');

  const styleBlock = `
    <style>
      .landxx{fill:#e8eef7 !important;stroke:#c5d2e3 !important;stroke-width:1.6 !important;}
      .coastxx{fill:#e8eef7 !important;stroke:#c5d2e3 !important;stroke-width:1.6 !important;}
      .circlexx{opacity:0 !important;}
      .oceanxx{fill:transparent !important;stroke:transparent !important;stroke-width:0 !important;}
      .limitxx,.unxx,.antxx{stroke:#c5d2e3 !important;}
      path{vector-effect:non-scaling-stroke;}
      ${countryStyles}
    </style>
  `;

  return svgSource
    .replace('<svg ', `<svg preserveAspectRatio="xMidYMid meet" `)
    .replace(/width="[^"]*"/, '')
    .replace(/height="[^"]*"/, '')
    .replace('>', `>${styleBlock}`);
}

function parseSvgViewBox(svgMarkup: string): SvgViewBox | null {
  const match = svgMarkup.match(/viewBox="([^"]+)"/i);
  if (!match) return null;
  const [minX, minY, width, height] = match[1].split(/[\s,]+/).map(Number);
  if ([minX, minY, width, height].some((value) => Number.isNaN(value))) return null;
  return { minX, minY, width, height };
}

function resolveLeadMapPoints(points: CountryStat[], svgMarkup: string): CountryStat[] {
  if (typeof document === 'undefined' || !svgMarkup) return points;

  const viewBox = parseSvgViewBox(svgMarkup);
  if (!viewBox) return points;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = `${viewBox.width}px`;
  container.style.height = `${viewBox.height}px`;
  container.style.visibility = 'hidden';
  container.style.pointerEvents = 'none';
  container.innerHTML = svgMarkup;
  document.body.appendChild(container);

  try {
    const svg = container.querySelector('svg');
    if (!svg) return points;

    return points.map((point) => {
      const countryClass = point.countryCode.toLowerCase();
      const countryElement = svg.querySelector<SVGGraphicsElement>(`#${countryClass}`);
      if (!countryElement) return point;

      try {
        const pathCandidates = Array.from(
          countryElement.querySelectorAll<SVGGraphicsElement>(`path.landxx.${countryClass}, path.${countryClass}`),
        );

        const candidateElements = [
          ...(countryElement.tagName.toLowerCase() === 'path' ? [countryElement] : []),
          ...pathCandidates,
        ];

        const bestMatch = candidateElements.reduce<{
          x: number;
          y: number;
          area: number;
        } | null>((best, element) => {
          const bbox = element.getBBox();
          const area = bbox.width * bbox.height;
          if (area <= 0) return best;

          if (!best || area > best.area) {
            return {
              x: bbox.x + bbox.width / 2,
              y: bbox.y + bbox.height / 2,
              area,
            };
          }

          return best;
        }, null);

        if (!bestMatch) {
          const bbox = countryElement.getBBox();
          return {
            ...point,
            x: bbox.x + bbox.width / 2,
            y: bbox.y + bbox.height / 2,
          };
        }

        return { ...point, x: bestMatch.x, y: bestMatch.y };
      } catch {
        return point;
      }
    });
  } finally {
    container.remove();
  }
}

function LeadWorldMap({
  svgMarkup,
  points,
  selectedCountry,
  onSelectCountry,
  onHoverCountry,
  hoveredCountry,
  hoverLabel,
  hoverPosition,
  zoom = 1,
  offset = { x: 0, y: 0 },
  onZoomIn,
  onZoomOut,
  onResetView,
  onOffsetChange,
  compact = false,
}: {
  svgMarkup: string;
  points: CountryStat[];
  selectedCountry: string | null;
  onSelectCountry: (countryCode: string) => void;
  onHoverCountry?: (payload: { countryCode: string | null; x: number; y: number }) => void;
  hoveredCountry?: string | null;
  hoverLabel?: string | null;
  hoverPosition?: { x: number; y: number } | null;
  zoom?: number;
  offset?: { x: number; y: number };
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  onOffsetChange?: (next: { x: number; y: number }) => void;
  compact?: boolean;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const viewBox = useMemo(() => parseSvgViewBox(svgMarkup), [svgMarkup]);
  const effectiveScale = zoom;
  const visiblePoints = points.filter((point) => point.x !== null && point.y !== null);
  const maxCount = Math.max(...visiblePoints.map((point) => point.count), 1);

  function getCountryFromEventTarget(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    const markerCountry = target.closest('[data-country]')?.getAttribute('data-country')?.toUpperCase() || '';
    if (markerCountry && /^[A-Z]{2}$/.test(markerCountry)) return markerCountry;
    const group = target.closest('g[id]');
    const id = group?.getAttribute('id')?.toUpperCase() || '';
    return id && /^[A-Z]{2}$/.test(id) ? id : null;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (compact || zoom <= 1 || !mapRef.current) return;
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const countryCode = getCountryFromEventTarget(event.target);
    if (onHoverCountry && mapRef.current) {
      const bounds = mapRef.current.getBoundingClientRect();
      onHoverCountry({
        countryCode,
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
    }

    if (!compact && dragStateRef.current) {
      const nextX = dragStateRef.current.originX + (event.clientX - dragStateRef.current.startX);
      const nextY = dragStateRef.current.originY + (event.clientY - dragStateRef.current.startY);
      onOffsetChange?.({ x: nextX, y: nextY });
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!compact) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    dragStateRef.current = null;
  }

  function handleMapClick(event: React.MouseEvent<HTMLDivElement>) {
    const countryCode = getCountryFromEventTarget(event.target);
    if (countryCode) onSelectCountry(countryCode);
  }

  return (
    <div
      ref={mapRef}
      onClick={handleMapClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        dragStateRef.current = null;
        onHoverCountry?.({ countryCode: null, x: 0, y: 0 });
      }}
      className={`relative overflow-hidden rounded-[24px] bg-white ${compact ? 'aspect-[2.34/1] min-h-[230px]' : 'aspect-[2.34/1] min-h-[420px]'} ${compact ? '' : 'cursor-grab active:cursor-grabbing'}`}
    >
      {!compact && (
        <div
          className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full border border-slate-200 bg-white/92 px-2 py-2 shadow-sm"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onZoomOut?.();
            }}
            className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
            aria-label="Karte herauszoomen"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onZoomIn?.();
            }}
            className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
            aria-label="Karte hineinzoomen"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onResetView?.();
            }}
            className="rounded-full px-2 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            Reset
          </button>
        </div>
      )}

      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${effectiveScale})`,
          transformOrigin: 'center center',
        }}
      >
        <div
          className={`absolute inset-0 flex items-center justify-center ${compact ? 'px-3 py-4' : 'px-6 py-5'} [&>svg]:h-auto [&>svg]:w-full [&>svg]:max-h-full [&>svg]:max-w-full`}
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
        {viewBox && (
          <div className={`pointer-events-none absolute inset-0 flex items-center justify-center ${compact ? 'px-3 py-4' : 'px-6 py-5'}`}>
            <svg
              className="h-auto w-full max-h-full max-w-full overflow-visible"
              viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
              preserveAspectRatio="xMidYMid meet"
            >
              {visiblePoints.map((point) => {
                const isSelected = point.countryCode === selectedCountry || point.countryCode === hoveredCountry;
                const radius = compact ? 10 + (point.count / maxCount) * 8 : 12 + (point.count / maxCount) * 12;
                const haloRadius = radius + (compact ? 6 : 8);

                return (
                  <g key={point.countryCode}>
                    <circle
                      cx={point.x!}
                      cy={point.y!}
                      r={haloRadius}
                      fill="rgba(37, 99, 235, 0.12)"
                      pointerEvents="none"
                    />
                    <circle
                      cx={point.x!}
                      cy={point.y!}
                      r={radius}
                      fill={isSelected ? '#2563EB' : '#3B82F6'}
                      stroke="#ffffff"
                      strokeWidth={compact ? 6 : 7}
                      pointerEvents="none"
                    />
                    <circle
                      data-country={point.countryCode}
                      cx={point.x!}
                      cy={point.y!}
                      r={haloRadius + (compact ? 4 : 6)}
                      fill="transparent"
                      pointerEvents="auto"
                      className="cursor-pointer"
                    >
                      <title>{`${point.countryName}: ${point.count}`}</title>
                    </circle>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>

      {!compact && hoverLabel && hoverPosition && (
        <div
          className="pointer-events-none absolute z-30 rounded-xl border border-slate-200 bg-white/96 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm"
          style={{
            left: Math.min(Math.max(hoverPosition.x + 12, 12), (mapRef.current?.clientWidth || 0) - 160),
            top: Math.max(hoverPosition.y - 42, 12),
          }}
        >
          {hoverLabel}
        </div>
      )}
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
  const {
    parkId,
    isKioskPark,
    kioskTimezone,
    kioskOpeningHours,
    kioskOpeningHoursConfig,
    kioskCheckLoading,
  } = usePark();
  const locationDetailsRef = useRef<HTMLDivElement | null>(null);
  const [leads, setLeads] = useState<Record<string, unknown>[]>([]);
  const [kioskPurchases, setKioskPurchases] = useState<KioskPurchaseRow[]>([]);
  const [stats, setStats] = useState({ total: 0, optedIn: 0 });
  const [filterOptIn, setFilterOptIn] = useState<boolean | null>(null);
  const [countryFilter, setCountryFilter] = useState('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [showLocationDetails, setShowLocationDetails] = useState(false);
  const [detailMapZoom, setDetailMapZoom] = useState(1);
  const [detailMapOffset, setDetailMapOffset] = useState({ x: 0, y: 0 });
  const [hoveredCountryInfo, setHoveredCountryInfo] = useState<{ countryCode: string | null; x: number; y: number } | null>(null);
  const [worldMapSvg, setWorldMapSvg] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [claimDelayLoading, setClaimDelayLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [parkId]);

  useEffect(() => {
    let active = true;

    fetch('/world-map-gray.svg')
      .then((response) => response.text())
      .then((svg) => {
        if (active) setWorldMapSvg(svg);
      })
      .catch(() => {
        if (active) setWorldMapSvg('');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!showLocationDetails) return;
    requestAnimationFrame(() => {
      locationDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [showLocationDetails]);

  useEffect(() => {
    let active = true;

    if (kioskCheckLoading || !parkId || !isKioskPark) {
      setKioskPurchases([]);
      setClaimDelayLoading(false);
      return () => {
        active = false;
      };
    }

    const claimDateKeys = Array.from(
      new Set(
        leads
          .filter((lead) => lead.source === 'photo_claim')
          .map((lead) => {
            const createdAt = typeof lead.created_at === 'string' ? new Date(lead.created_at) : null;
            return createdAt && !Number.isNaN(createdAt.getTime()) ? localDateKey(createdAt, kioskTimezone) : null;
          })
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort();

    if (claimDateKeys.length === 0) {
      setKioskPurchases([]);
      setClaimDelayLoading(false);
      return () => {
        active = false;
      };
    }

    const requestedDates = Array.from(
      new Set(
        claimDateKeys.flatMap((dateKey) =>
          Array.from({ length: 8 }, (_, offset) => shiftDateKey(dateKey, -offset)),
        ),
      ),
    ).sort();

    setClaimDelayLoading(true);

    Promise.allSettled(requestedDates.map((businessDate) => fetchKioskPhotosForDay(parkId, businessDate)))
      .then((results) => {
        if (!active) return;
        const deduped = new Map<string, KioskPurchaseRow>();
        results.forEach((result) => {
          if (result.status !== 'fulfilled') return;
          (result.value.purchases ?? []).forEach((purchase) => {
            if (typeof purchase.id === 'string' && purchase.id.length > 0) {
              deduped.set(purchase.id, purchase);
            }
          });
        });

        setKioskPurchases(
          Array.from(deduped.values()).sort(
            (left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime(),
          ),
        );
        setClaimDelayLoading(false);
      })
      .catch((loadError) => {
        if (!active) return;
        setKioskPurchases([]);
        setClaimDelayLoading(false);
        console.warn('Kaufdaten für Verzögerungsanalyse nicht verfügbar:', loadError);
      });

    return () => {
      active = false;
    };
  }, [isKioskPark, kioskCheckLoading, kioskTimezone, leads, parkId]);

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
        x: null,
        y: null,
      }))
      .sort((a, b) => b.count - a.count || a.countryName.localeCompare(b.countryName));
  }, [leads]);

  const optInRate = stats.total > 0 ? Math.round((stats.optedIn / stats.total) * 100) : 0;
  const worldMapMarkup = useMemo(
    () => buildWorldMapMarkup(worldMapSvg, countryStats, hoveredCountryInfo?.countryCode || selectedCountry),
    [countryStats, hoveredCountryInfo?.countryCode, selectedCountry, worldMapSvg],
  );
  const resolvedCountryStats = useMemo(
    () => resolveLeadMapPoints(countryStats, worldMapMarkup),
    [countryStats, worldMapMarkup],
  );
  const topCountries = resolvedCountryStats.slice(0, 6);
  const hoveredCountryStat = hoveredCountryInfo?.countryCode
    ? resolvedCountryStats.find((country) => country.countryCode === hoveredCountryInfo.countryCode) || null
    : null;
  const hoveredCountryLabel = hoveredCountryStat
    ? `${hoveredCountryStat.count} aus ${hoveredCountryStat.countryName}`
    : null;

  const claimDelayMatches = useMemo<ClaimDelayMatch[]>(() => {
    if (!isKioskPark || kioskPurchases.length === 0) return [];

    const purchasesByPhotoId = new Map<string, { id: string; purchasedAt: Date }>();
    kioskPurchases.forEach((purchase) => {
      if (typeof purchase.id !== 'string' || purchase.id.length === 0) return;
      const purchasedAt = new Date(purchase.capturedAt);
      if (Number.isNaN(purchasedAt.getTime())) return;
      purchasesByPhotoId.set(purchase.id, { id: purchase.id, purchasedAt });
    });

    const purchasesByEmail = new Map<string, { id: string; purchasedAt: Date }[]>();
    kioskPurchases.forEach((purchase) => {
      const email = normalizeEmail(purchase.email);
      if (!email) return;
      const purchasedAt = new Date(purchase.capturedAt);
      if (Number.isNaN(purchasedAt.getTime())) return;

      const bucket = purchasesByEmail.get(email) ?? [];
      bucket.push({ id: purchase.id, purchasedAt });
      purchasesByEmail.set(email, bucket);
    });

    purchasesByEmail.forEach((bucket) => {
      bucket.sort((left, right) => left.purchasedAt.getTime() - right.purchasedAt.getTime());
    });

    const leadsByEmail = new Map<string, { leadId: string; claimedAt: Date }[]>();
    const directMatches: ClaimDelayMatch[] = [];
    leads.forEach((lead) => {
      if (lead.source !== 'photo_claim') return;
      const claimedAt = typeof lead.created_at === 'string' ? new Date(lead.created_at) : null;
      if (!claimedAt || Number.isNaN(claimedAt.getTime())) return;
      const photoId = typeof lead.photo_id === 'string' ? lead.photo_id : null;

      if (photoId && purchasesByPhotoId.has(photoId)) {
        const purchaseEntry = purchasesByPhotoId.get(photoId)!;
        if (purchaseEntry.purchasedAt.getTime() <= claimedAt.getTime()) {
          const delayMs = Math.max(0, claimedAt.getTime() - purchaseEntry.purchasedAt.getTime());
          const claimedOnLaterDay =
            localDateKey(purchaseEntry.purchasedAt, kioskTimezone) !== localDateKey(claimedAt, kioskTimezone);
          const closingMinutes = getClosingMinutesForDate(
            purchaseEntry.purchasedAt,
            kioskTimezone,
            kioskOpeningHours,
            kioskOpeningHoursConfig,
          );
          const claimedAfterClose =
            !claimedOnLaterDay &&
            closingMinutes !== null &&
            localMinutes(claimedAt, kioskTimezone) > closingMinutes;
          const afterCloseMs =
            claimedAfterClose && closingMinutes !== null
              ? Math.max(0, localMinutes(claimedAt, kioskTimezone) - closingMinutes) * 60000
              : null;

          directMatches.push({
            leadId: String(lead.id ?? `${photoId}-${claimedAt.toISOString()}`),
            email: normalizeEmail(lead.email) ?? '',
            purchasedAt: purchaseEntry.purchasedAt,
            claimedAt,
            delayMs,
            claimedAfterClose,
            claimedOnLaterDay,
            afterCloseMs,
          });
          return;
        }
      }

      const email = normalizeEmail(lead.email);
      if (!email) return;

      const bucket = leadsByEmail.get(email) ?? [];
      bucket.push({ leadId: String(lead.id ?? `${email}-${claimedAt.toISOString()}`), claimedAt });
      leadsByEmail.set(email, bucket);
    });

    const matches: ClaimDelayMatch[] = [...directMatches];

    leadsByEmail.forEach((leadBucket, email) => {
      const purchaseBucket = purchasesByEmail.get(email);
      if (!purchaseBucket || purchaseBucket.length === 0) return;

      leadBucket.sort((left, right) => left.claimedAt.getTime() - right.claimedAt.getTime());
      const usedPurchaseIndexes = new Set<number>();

      leadBucket.forEach((leadEntry) => {
        let matchedPurchaseIndex = -1;
        for (let index = purchaseBucket.length - 1; index >= 0; index -= 1) {
          if (usedPurchaseIndexes.has(index)) continue;
          if (purchaseBucket[index].purchasedAt.getTime() <= leadEntry.claimedAt.getTime()) {
            matchedPurchaseIndex = index;
            break;
          }
        }

        if (matchedPurchaseIndex === -1) return;

        usedPurchaseIndexes.add(matchedPurchaseIndex);
        const purchaseEntry = purchaseBucket[matchedPurchaseIndex];
        const delayMs = Math.max(0, leadEntry.claimedAt.getTime() - purchaseEntry.purchasedAt.getTime());
        const claimedOnLaterDay =
          localDateKey(purchaseEntry.purchasedAt, kioskTimezone) !== localDateKey(leadEntry.claimedAt, kioskTimezone);
        const closingMinutes = getClosingMinutesForDate(
          purchaseEntry.purchasedAt,
          kioskTimezone,
          kioskOpeningHours,
          kioskOpeningHoursConfig,
        );
        const claimedAfterClose =
          !claimedOnLaterDay &&
          closingMinutes !== null &&
          localMinutes(leadEntry.claimedAt, kioskTimezone) > closingMinutes;
        const afterCloseMs =
          claimedAfterClose && closingMinutes !== null
            ? Math.max(0, localMinutes(leadEntry.claimedAt, kioskTimezone) - closingMinutes) * 60000
            : null;

        matches.push({
          leadId: leadEntry.leadId,
          email,
          purchasedAt: purchaseEntry.purchasedAt,
          claimedAt: leadEntry.claimedAt,
          delayMs,
          claimedAfterClose,
          claimedOnLaterDay,
          afterCloseMs,
        });
      });
    });

    return matches.sort((left, right) => right.delayMs - left.delayMs);
  }, [isKioskPark, kioskOpeningHours, kioskOpeningHoursConfig, kioskPurchases, kioskTimezone, leads]);

  const delayInsights = useMemo(() => {
    const matchedCount = claimDelayMatches.length;
    if (matchedCount === 0) {
      return {
        matchedCount: 0,
        avgDelayLabel: '—',
        maxDelayLabel: '—',
        minDelayLabel: '—',
        afterCloseAvgLabel: '—',
        afterCloseCount: 0,
        afterCloseRate: 0,
        laterDayCount: 0,
        laterDayRate: 0,
      };
    }

    const totalDelayMs = claimDelayMatches.reduce((sum, match) => sum + match.delayMs, 0);
    const maxDelayMs = Math.max(...claimDelayMatches.map((match) => match.delayMs));
    const minDelayMs = Math.min(...claimDelayMatches.map((match) => match.delayMs));
    const afterCloseCount = claimDelayMatches.filter((match) => match.claimedAfterClose).length;
    const laterDayCount = claimDelayMatches.filter((match) => match.claimedOnLaterDay).length;
    const afterCloseMatches = claimDelayMatches.filter((match) => typeof match.afterCloseMs === 'number');
    const afterCloseAvgMs = afterCloseMatches.length > 0
      ? afterCloseMatches.reduce((sum, match) => sum + (match.afterCloseMs ?? 0), 0) / afterCloseMatches.length
      : null;

    return {
      matchedCount,
      avgDelayLabel: formatDelay(totalDelayMs / matchedCount),
      maxDelayLabel: formatDelay(maxDelayMs),
      minDelayLabel: formatDelay(minDelayMs),
      afterCloseAvgLabel: afterCloseAvgMs === null ? '—' : formatDelay(afterCloseAvgMs),
      afterCloseCount,
      afterCloseRate: Math.round((afterCloseCount / matchedCount) * 100),
      laterDayCount,
      laterDayRate: Math.round((laterDayCount / matchedCount) * 100),
    };
  }, [claimDelayMatches]);

  function zoomDetailMapIn() {
    setDetailMapZoom((current) => {
      const next = Math.min(current * 1.5, 10);
      setDetailMapOffset((currentOffset) => ({
        x: currentOffset.x * (next / current),
        y: currentOffset.y * (next / current),
      }));
      return next;
    });
  }

  function zoomDetailMapOut() {
    setDetailMapZoom((current) => {
      const next = current <= 1.35 ? 1 : Math.max(current / 1.5, 0.45);
      setDetailMapOffset((currentOffset) => {
        if (next <= 1) return { x: 0, y: 0 };
        const ratio = next / current;
        return {
          x: currentOffset.x * ratio,
          y: currentOffset.y * ratio,
        };
      });
      return next;
    });
  }

  function resetDetailMapView() {
    setDetailMapZoom(1);
    setDetailMapOffset({ x: 0, y: 0 });
  }

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
    resolvedCountryStats.find((country) => country.countryCode === selectedCountry) || topCountries[0] || null;
  const totalMappedLeads = resolvedCountryStats.reduce((sum, country) => sum + country.count, 0);

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

      <div className="grid gap-4 xl:grid-cols-[210px_210px_minmax(0,1fr)]">
        <CompactMetricCard
          title={t('leads.total')}
          value={formatNumber(stats.total)}
          subtitle="Gesammelte Kontakte"
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

        <GlassCard className="overflow-hidden">
          <div className="border-b border-slate-100/90 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-500">Deine Besucher kennenlernen</p>
          </div>

          <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="px-6 py-5 lg:border-r lg:border-slate-100/90">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-slate-800">Besucher nach Standort</h3>
                <span className="text-sm text-slate-400">{resolvedCountryStats.length} Länder</span>
              </div>
              <LeadWorldMap
                svgMarkup={worldMapMarkup}
                points={resolvedCountryStats}
                selectedCountry={selectedCountryStat?.countryCode || null}
                onSelectCountry={setSelectedCountry}
                offset={{ x: 0, y: 0 }}
                compact
              />
              <button
                type="button"
                onClick={() =>
                  setShowLocationDetails((current) => {
                    const next = !current;
                    if (next) {
                      resetDetailMapView();
                    }
                    return next;
                  })
                }
                className="mt-3 text-sm font-medium text-sky-600 transition-colors hover:text-sky-700"
              >
                {showLocationDetails ? 'Detaillierte Karte ausblenden' : 'Detaillierte Karte anzeigen'}
              </button>
            </div>

            <div className="px-6 py-5">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-slate-800">Zeit zwischen Kauf und Einlösung</h3>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 bg-white/70 p-3">
                  <p className="text-[11px] font-bold tracking-[0.08em] text-slate-500">Durchschnittlich später</p>
                  <p className="mt-1.5 text-base font-bold text-slate-800">{delayInsights.avgDelayLabel}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">zwischen Kauf und Einlösung</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white/70 p-3">
                  <p className="text-[11px] font-bold tracking-[0.08em] text-slate-500">Nach Parkschluss</p>
                  <p className="mt-1.5 text-base font-bold text-slate-800">{delayInsights.afterCloseAvgLabel}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{delayInsights.afterCloseRate}% der Einlösungen</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white/70 p-3">
                  <p className="text-[11px] font-bold tracking-[0.08em] text-slate-500">Schnellste Einlösung</p>
                  <p className="mt-1.5 text-base font-bold text-slate-800">{delayInsights.minDelayLabel}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">frühester gemessener Abstand</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white/70 p-3">
                  <p className="text-[11px] font-bold tracking-[0.08em] text-slate-500">Nächster Tag oder später</p>
                  <p className="mt-1.5 text-base font-bold text-slate-800">{delayInsights.laterDayRate}%</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{delayInsights.laterDayCount} von {delayInsights.matchedCount}</p>
                </div>
              </div>

              {claimDelayLoading && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-5 py-4 text-sm text-slate-500">
                  Kauf und Einlösung werden gerade verknüpft…
                </div>
              )}

              {!claimDelayLoading && delayInsights.matchedCount === 0 && (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-4 text-sm text-slate-500">
                  Für die aktuelle Auswahl konnten Kauf und Einlösung noch nicht eindeutig verknüpft werden.
                </div>
              )}
            </div>
          </div>
        </GlassCard>
      </div>

      {showLocationDetails && (
        <div ref={locationDetailsRef}>
        <GlassCard className="overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-500">Besucher nach Standort</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-800">Detaillierte Weltkarte</h3>
            <p className="mt-1 text-sm text-slate-500">
              Klicke auf ein Land oder wähle rechts einen Eintrag aus, um die Leads gezielt anzusehen.
            </p>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-[1.55fr_0.85fr]">
            <div className="space-y-4">
              <LeadWorldMap
                svgMarkup={worldMapMarkup}
                points={resolvedCountryStats}
                selectedCountry={selectedCountryStat?.countryCode || null}
                onSelectCountry={setSelectedCountry}
                hoveredCountry={hoveredCountryInfo?.countryCode || null}
                hoverLabel={hoveredCountryLabel}
                hoverPosition={hoveredCountryInfo}
                zoom={detailMapZoom}
                offset={detailMapOffset}
                onOffsetChange={setDetailMapOffset}
                onZoomIn={zoomDetailMapIn}
                onZoomOut={zoomDetailMapOut}
                onResetView={resetDetailMapView}
                onHoverCountry={setHoveredCountryInfo}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Länder</p>
                  <p className="mt-2 text-2xl font-bold text-slate-800">{resolvedCountryStats.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Leads mit Land</p>
                  <p className="mt-2 text-2xl font-bold text-slate-800">{formatNumber(totalMappedLeads)}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {delayInsights.matchedCount > 0 ? 'Ø Kauf bis digital' : 'Digitale Zuordnungen'}
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-800">
                    {delayInsights.matchedCount > 0 ? delayInsights.avgDelayLabel : '—'}
                  </p>
                </div>
              </div>
            </div>

            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-2">
              {resolvedCountryStats.map((country) => {
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
        </GlassCard>
        </div>
      )}

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

    </div>
  );
}
