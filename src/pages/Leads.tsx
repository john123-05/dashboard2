import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, Download, Info, Minus, Plus, Share2, Star, Trash2, UserPlus, X } from 'lucide-react';
import { getOptionalSourceWarning, invokeEdgeFunction, isEdgeSourceUnavailable } from '../lib/edgeFunctions';
import { fetchKioskPhotosForDay, fetchKioskSales, getClosingMinutesForDate, type KioskPurchaseRow } from '../lib/kioskSales';
import { claimLinkFor, claimSiteBaseFor, fetchRecentPhotos } from '../lib/photoBrowser';
import { formatDate, formatNumber, exportToCSV } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import DataTable from '../components/ui/DataTable';
import { useI18n, useLocaleTag } from '../lib/i18n';
import { usePark } from '../contexts/ParkContext';
import MarketingHome from '../components/marketing/MarketingHome';
import UnlockCenter from '../components/survey/UnlockCenter';
import ContactSettings from '../components/survey/ContactSettings';
import {
  fetchSurveyConfig,
  fetchSurveyResults,
  fetchSocialResults,
  type UnlockMode,
  type SurveyConfig,
  type SurveyResults,
  type SocialResults,
} from '../lib/surveyApi';

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

function getCountryName(countryCode: string, locale: string): string {
  try {
    const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
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
  info,
  active,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof UserPlus;
  iconClassName: string;
  iconWrapClassName: string;
  info?: string;
  active?: boolean;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <GlassCard className={`relative h-full min-h-[132px] p-4 sm:min-h-[146px] ${infoOpen ? 'z-30' : ''}`}>
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">{title}</p>
          {info && (
            <button
              type="button"
              onClick={() => setInfoOpen((open) => !open)}
              aria-label={`Was ist ${title}?`}
              className="rounded-full text-slate-400 hover:text-slate-600"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <p
            className={`flex items-center gap-2 whitespace-nowrap font-bold tracking-tight text-slate-800 ${
              value.length > 6 ? 'text-xl sm:text-[1.4rem]' : 'text-[1.85rem] sm:text-[2rem]'
            }`}
          >
            {active !== undefined && (
              <span className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
            )}
            {value}
          </p>
          <div className={`rounded-xl p-2 ${iconWrapClassName}`}>
            <Icon className={`h-4.5 w-4.5 ${iconClassName}`} />
          </div>
        </div>
        <p className="text-xs leading-5 text-slate-500 sm:max-w-[10rem] sm:text-sm">{subtitle}</p>
      </div>
      {info && infoOpen && (
        <div className="absolute left-3 top-10 z-30 w-72 max-w-[calc(100vw-3rem)] rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600 shadow-lg">
          <p className="mb-1 font-semibold text-slate-800">{title}</p>
          {info}
          <button
            type="button"
            onClick={() => setInfoOpen(false)}
            className="mt-2 block text-xs font-semibold text-sky-600 hover:text-sky-700"
          >
            Schließen
          </button>
        </div>
      )}
    </GlassCard>
  );
}

// Die Weltkarte ist eine 1,1-MB-SVG mit über 2.000 Länderformen. Sie wird deshalb nur EINMAL
// zu Markup verarbeitet (`buildWorldMapSvg`); alles, was sich beim Überfahren/Auswählen ändert,
// steckt in einem kleinen separaten Stilblatt (`buildWorldMapStyle`). Früher wurde die ganze Karte
// bei jeder Mausbewegung neu gebaut und vom Browser neu eingelesen (Hänger im CRM).
function buildWorldMapSvg(svgSource: string): string {
  if (!svgSource) return '';
  return svgSource
    .replace('<svg ', `<svg preserveAspectRatio="xMidYMid meet" `)
    .replace(/width="[^"]*"/, '')
    .replace(/height="[^"]*"/, '');
}

function buildWorldMapStyle(points: CountryStat[], selectedCountry: string | null): string {
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

  return `
      .landxx{fill:#e8eef7 !important;stroke:#c5d2e3 !important;stroke-width:1.6 !important;}
      .coastxx{fill:#e8eef7 !important;stroke:#c5d2e3 !important;stroke-width:1.6 !important;}
      .circlexx{opacity:0 !important;}
      .oceanxx{fill:transparent !important;stroke:transparent !important;stroke-width:0 !important;}
      .limitxx,.unxx,.antxx{stroke:#c5d2e3 !important;}
      path{vector-effect:non-scaling-stroke;}
      ${countryStyles}
  `;
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
  styleCss,
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
  /** Hervorhebung der Länder (Auswahl/Hover) - getrennt von der schweren Karte. */
  styleCss?: string;
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
  const { t } = useI18n();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const pendingHoverRef = useRef<{ countryCode: string | null; x: number; y: number } | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
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
      pendingHoverRef.current = {
        countryCode,
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
      // Höchstens ein Update pro Bild: jede Mausbewegung rendert sonst die ganze CRM-Seite neu.
      if (hoverFrameRef.current === null) {
        hoverFrameRef.current = requestAnimationFrame(() => {
          hoverFrameRef.current = null;
          if (pendingHoverRef.current) onHoverCountry(pendingHoverRef.current);
        });
      }
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
        pendingHoverRef.current = null;
        onHoverCountry?.({ countryCode: null, x: 0, y: 0 });
      }}
      className={`relative overflow-hidden rounded-[24px] bg-white ${compact ? 'aspect-[2.5/1] min-h-[150px] sm:aspect-[2.34/1] sm:min-h-[220px] lg:min-h-[230px]' : 'aspect-[2.34/1] min-h-[320px] sm:min-h-[420px]'} ${compact ? '' : 'cursor-grab active:cursor-grabbing'}`}
    >
      {styleCss && <style>{styleCss}</style>}
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
            aria-label={t('leads.map_zoom_out')}
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
            aria-label={t('leads.map_zoom_in')}
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
        className={`absolute inset-0 flex items-center justify-center ${compact ? 'px-2 py-3 sm:px-3 sm:py-4' : 'px-6 py-5'} [&>svg]:h-auto [&>svg]:w-full [&>svg]:max-h-full [&>svg]:max-w-full`}
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
      {viewBox && (
          <div className={`pointer-events-none absolute inset-0 flex items-center justify-center ${compact ? 'px-2 py-3 sm:px-3 sm:py-4' : 'px-6 py-5'}`}>
            <svg
              className="h-auto w-full max-h-full max-w-full overflow-visible"
              viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
              preserveAspectRatio="xMidYMid meet"
            >
              {visiblePoints.map((point) => {
                const isSelected = point.countryCode === selectedCountry || point.countryCode === hoveredCountry;
                const radius = compact ? 8 + (point.count / maxCount) * 5 : 12 + (point.count / maxCount) * 12;
                const haloRadius = radius + (compact ? 5 : 8);

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
                      strokeWidth={compact ? 5 : 7}
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

/**
 * CRM: oben der Umschalter (E-Mail / Umfrage / Social Media), darunter je Weg ein
 * Reiter. Die Kontaktliste steckt im Reiter „Kontakte“.
 */
export default function Leads({ embedded = false }: { embedded?: boolean } = {}) {
  const { parkId } = usePark();
  if (!parkId) return <LeadsContacts embedded={embedded} view="overview" />;
  return (
    <div className={embedded ? 'space-y-5' : 'space-y-6'}>
      <UnlockCenter parkId={parkId} routed={!embedded}>
        {(view) => <LeadsContacts embedded={embedded} view={view} />}
      </UnlockCenter>
    </div>
  );
}

function LeadsContacts({
  embedded = false,
  view,
}: {
  embedded?: boolean;
  view: 'overview' | 'list';
}) {
  const { t } = useI18n();
  const locale = useLocaleTag();
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
  // Mehrfach abgegebene Adressen: alle / nur die Mehrfachen / je Adresse nur die
  // älteste Zeile ("ohne Doppelte").
  const [duplicateFilter, setDuplicateFilter] = useState<'all' | 'only' | 'unique'>('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | '1' | '7' | '30' | '90'>('all');
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
  // Spaltenauswahl der Kontaktliste (pro Browser gemerkt) und Kontakt-Schublade.
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('lp-crm-columns');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : [];
    } catch {
      return [];
    }
  });
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [drawerLead, setDrawerLead] = useState<Record<string, unknown> | null>(null);
  function toggleColumn(key: string) {
    setHiddenColumns((current) => {
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      try {
        localStorage.setItem('lp-crm-columns', JSON.stringify(next));
      } catch {
        /* nur Komfort */
      }
      return next;
    });
  }

  // Nur für die Übersicht: aktiver Freischalt-Modus, Lebenszeit-Verkäufe und
  // die letzten 30 Tage je Modus - unabhängig vom Freischalt-Reiter geladen,
  // damit "Kontakte"/Liste nicht unnötig mitlädt.
  const [unlockMode, setUnlockMode] = useState<UnlockMode | null>(null);
  const [contactConfig, setContactConfig] = useState<SurveyConfig | null>(null);
  const [lifetimeSold, setLifetimeSold] = useState<number | null>(null);
  const [overviewSurvey, setOverviewSurvey] = useState<SurveyResults | null>(null);
  const [overviewSocial, setOverviewSocial] = useState<SocialResults | null>(null);
  const [latestPhotoCode, setLatestPhotoCode] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [parkId]);

  const loadContactConfig = useCallback(() => {
    if (!parkId) return;
    fetchSurveyConfig(parkId)
      .then((c) => {
        setContactConfig(c);
        setUnlockMode(c.settings.mode);
      })
      .catch(() => {});
  }, [parkId]);

  // Geladen unabhängig vom Reiter: "Kontakte" braucht die Kontaktfeld-
  // Einstellungen (E-Mail/Telefon/Adresse), "Übersicht" den aktiven Modus.
  useEffect(() => {
    loadContactConfig();
  }, [loadContactConfig]);

  useEffect(() => {
    if (view !== 'overview' || !parkId) return;
    let active = true;

    fetchKioskSales(parkId)
      .then((res) => {
        if (active) setLifetimeSold(res.days.reduce((sum, d) => sum + d.photos_sold_count, 0));
      })
      .catch(() => active && setLifetimeSold(null));

    fetchRecentPhotos(parkId, 1)
      .then((photos) => active && setLatestPhotoCode(photos[0]?.externalCode ?? null))
      .catch(() => active && setLatestPhotoCode(null));

    fetchSurveyResults(parkId, 30).then((r) => active && setOverviewSurvey(r)).catch(() => {});
    fetchSocialResults(parkId, 30).then((r) => active && setOverviewSocial(r)).catch(() => {});

    return () => {
      active = false;
    };
  }, [view, parkId, unlockMode]);

  useEffect(() => {
    // Die 1,1-MB-Weltkarte wird erst geholt, wenn jemand sie öffnet (C4).
    if (!showLocationDetails || worldMapSvg) return;
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
  }, [showLocationDetails, worldMapSvg]);

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
          .filter((lead) => lead.source === 'photo_claim' || lead.source === 'social_media')
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
      useSessionAuth: true,
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

  const emailKey = (lead: Record<string, unknown>) =>
    typeof lead.email === 'string' ? lead.email.trim().toLowerCase() : '';

  // Wie oft jede Adresse in der ganzen Liste vorkommt (unabhängig von den Filtern),
  // und welche Zeile je Adresse die älteste ist.
  const duplicateInfo = useMemo(() => {
    const counts = new Map<string, number>();
    // Welche Zeile je Adresse bleibt: eine mit Newsletter-Zustimmung (die
    // Zustimmung soll nicht verloren gehen), sonst die älteste.
    const keep = new Map<string, { id: unknown; optedIn: boolean; time: number }>();
    leads.forEach((lead) => {
      const key = emailKey(lead);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
      const time = typeof lead.created_at === 'string' ? Date.parse(lead.created_at) : Number.POSITIVE_INFINITY;
      const optedIn = lead.opted_in === true;
      const current = keep.get(key);
      if (!current || (optedIn && !current.optedIn) || (optedIn === current.optedIn && time < current.time)) {
        keep.set(key, { id: lead.id, optedIn, time });
      }
    });
    const duplicateAddresses = [...counts.values()].filter((n) => n > 1).length;
    return { counts, keep, duplicateAddresses };
  }, [leads]);

  const sourceOptions = useMemo(
    () => [...new Set(leads.map((lead) => (typeof lead.source === 'string' ? lead.source : '')).filter(Boolean))].sort(),
    [leads],
  );

  const filtered = leads.filter((lead) => {
    if (filterOptIn !== null && lead.opted_in !== filterOptIn) return false;
    if (countryFilter !== 'all') {
      const rowCountry = typeof lead.country_code === 'string' ? lead.country_code.trim().toUpperCase() : '';
      if (rowCountry !== countryFilter) return false;
    }
    if (sourceFilter !== 'all' && lead.source !== sourceFilter) return false;
    if (periodFilter !== 'all') {
      const time = typeof lead.created_at === 'string' ? Date.parse(lead.created_at) : NaN;
      if (Number.isNaN(time) || time < Date.now() - Number(periodFilter) * 86_400_000) return false;
    }
    if (duplicateFilter !== 'all') {
      const key = emailKey(lead);
      const count = key ? duplicateInfo.counts.get(key) || 0 : 0;
      if (duplicateFilter === 'only' && count < 2) return false;
      if (duplicateFilter === 'unique' && key && duplicateInfo.keep.get(key)?.id !== lead.id) return false;
    }
    return true;
  });
  // Bei "nur mehrfach abgegebene" stehen die Zeilen einer Adresse untereinander.
  if (duplicateFilter === 'only') {
    filtered.sort((a, b) => {
      const byEmail = emailKey(a).localeCompare(emailKey(b));
      if (byEmail !== 0) return byEmail;
      return Date.parse(String(a.created_at ?? '')) - Date.parse(String(b.created_at ?? ''));
    });
  }

  // Zeilen, die beim Bereinigen wegfallen würden (alle außer der behaltenen je Adresse).
  const extraDuplicateIds = filtered
    .filter((lead) => {
      const key = emailKey(lead);
      return key && (duplicateInfo.counts.get(key) || 0) > 1 && duplicateInfo.keep.get(key)?.id !== lead.id
        && (lead.source === 'photo_claim' || lead.source === 'social_media') && typeof lead.id === 'string';
    })
    .map((lead) => String(lead.id));

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
        countryName: getCountryName(countryCode, locale),
        count,
        x: null,
        y: null,
      }))
      .sort((a, b) => b.count - a.count || a.countryName.localeCompare(b.countryName));
  }, [leads, locale]);

  const worldMapMarkup = useMemo(() => buildWorldMapSvg(worldMapSvg), [worldMapSvg]);
  const worldMapStyle = useMemo(
    () => buildWorldMapStyle(countryStats, hoveredCountryInfo?.countryCode || selectedCountry),
    [countryStats, hoveredCountryInfo?.countryCode, selectedCountry],
  );
  // Positionen der Länderpunkte: messen ist teuer (die ganze Karte wird dafür unsichtbar
  // aufgebaut). Nur wenn sich Karte oder Länderliste ändern - nie beim Überfahren - und erst
  // nach dem ersten Zeichnen, damit die Seite sofort bedienbar ist.
  const [resolvedCountryStats, setResolvedCountryStats] = useState<CountryStat[]>(countryStats);
  useEffect(() => {
    setResolvedCountryStats(countryStats);
    if (!worldMapMarkup || !showLocationDetails) return;
    const timer = window.setTimeout(() => {
      setResolvedCountryStats(resolveLeadMapPoints(countryStats, worldMapMarkup));
    }, 50);
    return () => window.clearTimeout(timer);
  }, [countryStats, worldMapMarkup, showLocationDetails]);
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
    return (lead.source === 'photo_claim' || lead.source === 'social_media') && typeof lead.id === 'string' && lead.id.length > 0;
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
    const hinweis = '\n\nHinweis: Das löscht den Eintrag der Foto-Freischaltung. Der Freischalt-Link dieses Gastes für das zugehörige Foto funktioniert danach nicht mehr.';
    if (!confirm((plural ? `${ids.length} E-Mail-Leads wirklich löschen?` : 'Diesen E-Mail-Lead wirklich löschen?') + hinweis)) {
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
          phone: (l.phone as string) || '',
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
          <h3 className="text-lg font-semibold text-red-800 mb-2">{t('leads.load_error')}</h3>
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
          aria-label={t('leads.select_all_visible')}
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
            aria-label={t('leads.select_contact', { email: item.email as string })}
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
            <button
              type="button"
              onClick={() => setDrawerLead(item)}
              title={t('mk.open_contact')}
              className="w-fit text-left font-medium text-slate-700 hover:text-brand-700 hover:underline"
            >
              {(item.email as string) || (item.phone as string) || '–'}
            </button>
            {Boolean(item.email) && Boolean(item.phone) && (
              <span className="text-xs text-slate-500">{item.phone as string}</span>
            )}
            {(duplicateInfo.counts.get(emailKey(item)) || 0) > 1 && (
              duplicateInfo.keep.get(emailKey(item))?.id === item.id ? (
                <span
                  className="inline-flex w-fit rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-200"
                  title={t('leads.keep_tooltip')}
                >
                  {t('leads.kept_multiple', { count: duplicateInfo.counts.get(emailKey(item)) ?? 0 })}
                </span>
              ) : (
                <span
                  className="inline-flex w-fit rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200"
                  title={t('leads.duplicate_tooltip')}
                >
                  {t('leads.duplicate_multiple', { count: duplicateInfo.counts.get(emailKey(item)) ?? 0 })}
                </span>
              )
            )}
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
          {item.source === 'social_media' ? t('leads.source_social') : item.source === 'photo_claim' ? t('leads.source_claim') : (item.source as string)}
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
        <span className="text-slate-500">{formatDate(item.created_at as string, locale)}</span>
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
            title={t('leads.delete_contact_title')}
            aria-label={t('leads.delete_contact', { email: item.email as string })}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        );
      },
    },
  ];

  return (
    <div className={embedded ? 'customer-embedded-root preview-leads space-y-5' : 'space-y-6'}>
      {view === 'list' && (
        <div className={`flex flex-wrap items-start justify-between gap-3 ${embedded ? 'customer-operator-pagehead' : ''}`}>
          {contactConfig && (
            <ContactSettings
              parkId={parkId ?? ''}
              email={contactConfig.settings.email_mode ?? 'required'}
              phone={contactConfig.settings.phone_mode ?? 'off'}
              address={contactConfig.settings.address_mode ?? 'off'}
              onSaved={loadContactConfig}
            />
          )}
          <GlassCard className="shrink-0 p-5 sm:p-6">
            <div className="flex items-end gap-6">
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-600">{t('leads.contacts_total')}</p>
                <div className="rounded-xl bg-white/60 px-4 py-1.5 text-sm font-semibold text-slate-800">
                  {formatNumber(stats.total, locale)}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-600">{t('leads.contacts_optin')}</p>
                <div className="rounded-xl bg-white/60 px-4 py-1.5 text-sm font-semibold text-slate-800">
                  {formatNumber(stats.optedIn, locale)}
                </div>
              </div>
            </div>
          </GlassCard>
          <button onClick={handleExport} className="glass-button-secondary">
            <Download className="h-4 w-4" />
            {t('leads.export')}
          </button>
        </div>
      )}

      {notice && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">{t('leads.unavailable')}</p>
          <p className="mt-1 text-sm text-amber-700">{notice}</p>
        </div>
      )}

      {view === 'overview' && (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {parkId && (
            <MarketingHome
              parkId={parkId}
              leads={leads}
              lifetimeSold={lifetimeSold}
              config={contactConfig}
              survey30={overviewSurvey}
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <CompactMetricCard
              title={t('leads.current_mode')}
              value={
                unlockMode === 'survey'
                  ? t('crm.survey')
                  : unlockMode === 'social'
                    ? t('leads.source_social')
                    : unlockMode === 'email'
                      ? 'E-Mail'
                      : '–'
              }
              subtitle={t('leads.current_mode_sub')}
              icon={ClipboardList}
              iconClassName="text-amber-600"
              iconWrapClassName="bg-amber-50"
              active={unlockMode !== null}
            />
            <CompactMetricCard
              title={t('leads.satisfaction')}
              value={overviewSurvey?.average_score != null ? overviewSurvey.average_score.toFixed(1) : '–'}
              subtitle={t('leads.satisfaction_sub')}
              icon={Star}
              iconClassName="text-amber-600"
              iconWrapClassName="bg-amber-50"
            />
            <CompactMetricCard
              title="Social Media"
              value={unlockMode === 'social' ? t('leads.active') : t('leads.inactive')}
              subtitle={
                unlockMode === 'social' && overviewSocial
                  ? t('leads.unlocks_30', { count: formatNumber(overviewSocial.unlocked, locale) })
                  : t('leads.currently_inactive')
              }
              icon={Share2}
              iconClassName="text-pink-600"
              iconWrapClassName="bg-pink-50"
              active={unlockMode === 'social'}
            />
          </div>

          <GlassCard className="overflow-hidden">
            <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="px-6 py-5 lg:border-r lg:border-slate-100/90">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-800">{t('leads.location')}</h3>
                  <span className="text-xs text-slate-400 sm:text-sm">{t('leads.country_count', { count: resolvedCountryStats.length })}</span>
                </div>
                <ul className="space-y-2.5 pb-1">
                  {countryStats.slice(0, 5).map((country) => {
                    const share = countryStats[0]?.count ? (country.count / countryStats[0].count) * 100 : 0;
                    return (
                      <li key={country.countryCode} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                        <p className="min-w-0 truncate text-sm text-[color:var(--ink-2)]">
                          {countryCodeToFlag(country.countryCode)} {country.countryName}
                        </p>
                        <p className="text-sm font-semibold text-[color:var(--ink)]">{formatNumber(country.count, locale)}</p>
                        <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(3, share)}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
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
                  {showLocationDetails ? t('leads.hide_map') : t('leads.show_map')}
                </button>
              </div>

              <div className="px-6 py-5">
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-slate-800">{t('leads.claim_delay')}</h3>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl border border-slate-100 bg-white/70 p-3">
                    <p className="text-[11px] font-bold tracking-[0.08em] text-slate-500">{t('leads.avg_later')}</p>
                    <p className="mt-1.5 text-base font-bold text-slate-800">{delayInsights.avgDelayLabel}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{t('leads.between_purchase_claim')}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white/70 p-3">
                    <p className="text-[11px] font-bold tracking-[0.08em] text-slate-500">{t('leads.after_close')}</p>
                    <p className="mt-1.5 text-base font-bold text-slate-800">{delayInsights.afterCloseAvgLabel}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{t('leads.claim_rate', { percent: delayInsights.afterCloseRate })}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white/70 p-3">
                    <p className="text-[11px] font-bold tracking-[0.08em] text-slate-500">{t('leads.fastest_claim')}</p>
                    <p className="mt-1.5 text-base font-bold text-slate-800">{delayInsights.minDelayLabel}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{t('leads.earliest_gap')}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white/70 p-3">
                    <p className="text-[11px] font-bold tracking-[0.08em] text-slate-500">{t('leads.next_day')}</p>
                    <p className="mt-1.5 text-base font-bold text-slate-800">{delayInsights.laterDayRate}%</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{t('leads.out_of', { count: delayInsights.laterDayCount, total: delayInsights.matchedCount })}</p>
                  </div>
                </div>

                {claimDelayLoading && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-5 py-4 text-sm text-slate-500">
                    {t('leads.matching')}
                  </div>
                )}

                {!claimDelayLoading && delayInsights.matchedCount === 0 && (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-4 text-sm text-slate-500">
                    {t('leads.no_matching')}
                  </div>
                )}
              </div>
            </div>
          </GlassCard>

          {showLocationDetails && (
            <div ref={locationDetailsRef}>
            <GlassCard className="overflow-hidden">
              <div className="border-b border-slate-100 px-6 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-500">{t('leads.location')}</p>
                    <h3 className="mt-2 text-2xl font-semibold text-slate-800">{t('leads.world_map')}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {t('leads.world_map_desc')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLocationDetails(false)}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {t('leads.collapse')}
                  </button>
                </div>
              </div>

              <div className="space-y-5 p-4 sm:p-6">
                <div className="space-y-4">
                  <div className="-mx-2 overflow-x-auto pb-2 sm:mx-0 sm:overflow-visible sm:pb-0">
                    <div className="min-w-[320px] w-full sm:min-w-0">
                      <LeadWorldMap
                        svgMarkup={worldMapMarkup}
                        styleCss={worldMapStyle}
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
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('leads.countries')}</p>
                      <p className="mt-2 text-2xl font-bold text-slate-800">{resolvedCountryStats.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('leads.with_country')}</p>
                      <p className="mt-2 text-2xl font-bold text-slate-800">{formatNumber(totalMappedLeads, locale)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {delayInsights.matchedCount > 0 ? t('leads.purchase_to_digital') : t('leads.digital_matches')}
                      </p>
                      <p className="mt-2 text-lg font-bold text-slate-800">
                        {delayInsights.matchedCount > 0 ? delayInsights.avgDelayLabel : '—'}
                      </p>
                    </div>
                  </div>                </div>

                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {t('leads.guests_by_country')} ({formatNumber(resolvedCountryStats.length, locale)})
                    </p>
                <div className="flex gap-2 overflow-x-auto pb-3">
                  {resolvedCountryStats.map((country) => {
                    const share = totalMappedLeads > 0 ? Math.round((country.count / totalMappedLeads) * 100) : 0;
                    const active = country.countryCode === selectedCountryStat?.countryCode;
                    return (
                      <button
                        key={country.countryCode}
                        type="button"
                        onClick={() => setSelectedCountry(country.countryCode)}
                        className={`w-64 shrink-0 rounded-2xl border px-4 py-2.5 text-left transition-all ${
                          active
                            ? 'border-sky-200 bg-sky-50/80 shadow-sm'
                            : 'border-slate-100 bg-white hover:border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 truncate font-medium text-slate-700">
                            {countryCodeToFlag(country.countryCode)} {country.countryName}
                          </p>
                          <p className="shrink-0 text-right">
                            <span className="font-semibold text-slate-800">{country.count}</span>
                            <span className="ml-2 text-xs text-slate-400">{share}%</span>
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                  </div>
                </div>
              </div>
            </GlassCard>
            </div>
          )}
        </div>

        {claimSiteBaseFor(parkId) && (
          <GlassCard className="flex h-full min-h-[700px] flex-col overflow-hidden p-0">
            <div className="shrink-0 border-b border-slate-100/90 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">Live-Vorschau</p>
              <p className="text-xs text-slate-500">
                {t('leads.claim_preview_desc')}
              </p>
            </div>
            <iframe
              src={claimLinkFor(parkId, latestPhotoCode) ?? claimSiteBaseFor(parkId) ?? undefined}
              title={t('leads.preview_title')}
              scrolling="yes"
              className="w-full flex-1 border-0"
            />
          </GlassCard>
        )}
      </div>
      )}

      {view === 'list' && (
      <DataTable
        data={filtered}
        columns={columns.filter((column) => !hiddenColumns.includes(column.key))}
        title={t('leads.title')}
        searchable
        searchKeys={['email', 'phone', 'full_name', 'source', 'park_name', 'country_code', 'locale']}
        pageSize={embedded ? 8 : 10}
        embeddedOperator={embedded}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setColumnMenuOpen((open) => !open)}
                aria-expanded={columnMenuOpen}
                className="rounded-lg border border-[color:var(--line-strong)] px-3 py-1.5 text-sm font-medium text-[color:var(--ink-2)] hover:bg-slate-100"
              >
                {t('mk.columns')}
              </button>
              {columnMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setColumnMenuOpen(false)} />
                  <div className="absolute right-0 z-40 mt-2 w-48 rounded-lg border border-[color:var(--line)] bg-white p-2 shadow-lg">
                    {[
                      ['full_name', t('leads.table.name')],
                      ['park_name', t('leads.table.park')],
                      ['source', t('leads.table.source')],
                      ['opted_in', t('leads.table.opted_in')],
                      ['created_at', t('leads.table.date')],
                    ].map(([key, label]) => (
                      <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[color:var(--ink-2)] hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={!hiddenColumns.includes(key)}
                          onChange={() => toggleColumn(key)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={toggleSelectionMode}
              className={
                embedded
                  ? `customer-operator-btn ${selectionMode ? 'active' : ''}`
                  : `rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      selectionMode
                        ? 'border-sky-200 bg-sky-50 text-sky-700'
                        : 'border-slate-200/60 bg-white/60 text-slate-600 hover:bg-white/80'
                    }`
              }
            >
              {selectionMode ? t('leads.select_done') : t('leads.select')}
            </button>
            {duplicateFilter === 'only' && extraDuplicateIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectionMode(true);
                  setSelectedLeadIds(extraDuplicateIds);
                }}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100"
                title={t('leads.preselect_duplicates_hint')}
              >
                {t('leads.preselect_duplicates', { count: extraDuplicateIds.length })}
              </button>
            )}
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
              value={duplicateFilter}
              onChange={(e) => setDuplicateFilter(e.target.value as 'all' | 'only' | 'unique')}
              className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 text-sm text-slate-700"
            >
              <option value="all">{t('leads.duplicate_all')}</option>
              <option value="only">
                {t('leads.only_duplicates', { count: duplicateInfo.duplicateAddresses })}
              </option>
              <option value="unique">{t('leads.unique_only')}</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 text-sm text-slate-700"
            >
              <option value="all">{t('leads.all_sources')}</option>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as 'all' | '1' | '7' | '30' | '90')}
              className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 text-sm text-slate-700"
            >
              <option value="all">{t('leads.all_periods')}</option>
              <option value="1">{t('leads.today')}</option>
              <option value="7">7 Tage</option>
              <option value="30">30 Tage</option>
              <option value="90">90 Tage</option>
            </select>
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 text-sm text-slate-700"
            >
              <option value="all">{t('leads.all_countries')}</option>
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
                {t('leads.delete_count', { count: selectedLeadIds.length })}
              </button>
            )}
          </div>
        }
      />
      )}

      {drawerLead && (
        <div className="fixed inset-0 z-[80]" role="presentation">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setDrawerLead(null)} />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={t('mk.contact_details')}
            className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line)] px-6 py-5">
              <div className="min-w-0">
                <p className="text-xs text-[color:var(--ink-3)]">{t('mk.contact_details')}</p>
                <h3 className="mt-1 truncate text-lg font-semibold text-[color:var(--ink)]">
                  {(drawerLead.full_name as string) || (drawerLead.email as string) || (drawerLead.phone as string) || '–'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDrawerLead(null)}
                aria-label={t('mk.close')}
                className="rounded-md p-1.5 text-[color:var(--ink-3)] hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <dl className="flex-1 divide-y divide-[color:var(--line)] overflow-y-auto px-6">
              {[
                [t('leads.table.email'), drawerLead.email as string | null],
                [t('mk.field_phone'), drawerLead.phone as string | null],
                [t('leads.table.name'), drawerLead.full_name as string | null],
                [
                  t('mk.field_country'),
                  typeof drawerLead.country_code === 'string' && drawerLead.country_code
                    ? `${countryCodeToFlag(drawerLead.country_code)} ${getCountryName(drawerLead.country_code.toUpperCase(), locale)}`
                    : null,
                ],
                [t('mk.field_language'), leadLocaleBadge(drawerLead)],
                [
                  t('leads.table.source'),
                  drawerLead.source === 'social_media'
                    ? t('leads.source_social')
                    : drawerLead.source === 'photo_claim'
                      ? t('leads.source_claim')
                      : (drawerLead.source as string | null),
                ],
                [t('leads.table.opted_in'), drawerLead.opted_in ? t('leads.opted_in') : t('leads.opted_out')],
                [t('leads.table.date'), drawerLead.created_at ? formatDate(drawerLead.created_at as string, locale) : null],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-3">
                  <dt className="text-sm text-[color:var(--ink-3)]">{label}</dt>
                  <dd className="break-words text-sm text-[color:var(--ink)]">{value || '–'}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      )}

    </div>
  );
}
