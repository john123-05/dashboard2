import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Camera,
  ChevronRight,
  ExternalLink,
  Gauge,
  Info,
  Printer,
  Search,
  Server,
  ShoppingBag,
  X,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import BeforeAfterSlider from '../components/ui/BeforeAfterSlider';
import { usePark } from '../contexts/ParkContext';
import { ladeZahlungen, type ZahlungsAutomat } from '../lib/zahlungen';
import { loadParkDashboardData } from '../lib/parkDashboard';
import { fetchParkEquipment, meldeAusstattungsInteresse, type EquipmentItem } from '../lib/equipment';
import { formatNumber } from '../lib/utils';

type Gruppe = 'Hardware' | 'Materialien' | 'Software' | 'Wartung' | 'Support' | 'Services';

const FOTOPAPIER_KEY = '__fotopapier__';

const KATEGORIE_ICON: Record<string, typeof Camera> = {
  Automat: Server,
  Kamera: Camera,
  Zubehoer: Printer,
  Software: Gauge,
  Webshop: ShoppingBag,
  Sonstiges: Gauge,
};

const KATEGORIE_GRUPPE: Record<string, Gruppe> = {
  Automat: 'Hardware',
  Kamera: 'Hardware',
  Zubehoer: 'Hardware',
  Software: 'Software',
  Webshop: 'Services',
  Sonstiges: 'Services',
};

const GRUPPEN_REIHENFOLGE: Gruppe[] = ['Hardware', 'Materialien', 'Software', 'Wartung', 'Support', 'Services'];

function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </GlassCard>
  );
}

function SpecTile({ sub, label, value, action }: { sub: string; label: string; value: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{sub}</p>
        {action}
      </div>
      <div>
        <p className="text-base font-semibold text-slate-800">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function HeaderIconLink({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Info }) {
  return (
    <Link
      to={to}
      title={label}
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/60 text-slate-500 transition hover:bg-white hover:text-slate-700"
    >
      <Icon className="h-4 w-4" />
    </Link>
  );
}

/**
 * Sind Startbild, Bild 2 und Bild 3 alle gesetzt, ist das eine Bildergalerie
 * (Startbild, Produkte/Beschreibung, Preise) und kein Vorher/Nachher-Regler.
 */
function galerieBilder(item: EquipmentItem): string[] {
  if (!item.image_url || !item.before_image_url || !item.after_image_url) return [];
  return [item.image_url, item.before_image_url, item.after_image_url];
}

export default function Configuration() {
  const { parkId, isKioskPark } = usePark();
  const [machines, setMachines] = useState<ZahlungsAutomat[]>([]);
  const [paperRemaining, setPaperRemaining] = useState<number | null>(null);
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [requestedKeys, setRequestedKeys] = useState<Set<string>>(new Set());
  const [suche, setSuche] = useState('');
  const [filterKategorie, setFilterKategorie] = useState<string | null>(null);
  const [galerie, setGalerie] = useState<{ item: EquipmentItem; index: number } | null>(null);

  useEffect(() => {
    if (!parkId) return;
    let active = true;
    setLoading(true);
    Promise.all([
      ladeZahlungen(parkId).catch(() => []),
      loadParkDashboardData(parkId).catch(() => ({ data: null, error: null })),
      fetchParkEquipment(parkId).catch(() => []),
    ])
      .then(([machineRows, parkDashboard, equipmentItems]) => {
        if (!active) return;
        setMachines(machineRows);
        setPaperRemaining(parkDashboard.data?.summary.printer_paper_remaining ?? null);
        setItems(equipmentItems);
        setError(null);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [parkId]);

  async function handleAnfrage(key: string, target: { itemId: string } | { label: string }) {
    if (!parkId) return;
    setRequestKey(key);
    try {
      await meldeAusstattungsInteresse(parkId, target);
      setRequestedKeys((prev) => new Set(prev).add(key));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anfrage fehlgeschlagen.');
    } finally {
      setRequestKey(null);
    }
  }

  function anfrageLabel(key: string, idle = 'Jetzt anfragen') {
    if (requestedKeys.has(key)) return 'Anfrage gesendet';
    if (requestKey === key) return 'Wird gesendet…';
    return idle;
  }

  const vorhanden = items.filter((i) => i.status === 'vorhanden');
  const empfohlen = items.filter((i) => i.status === 'empfohlen');
  const cardOnlyCount = machines.filter((m) => m.card_only).length;
  const istNurKarte = machines.length > 0 && cardOnlyCount === machines.length;
  const hatSpeedmessung = machines.some((m) => m.speed_enabled);
  const hatVideo = machines.some((m) => m.video_enabled);
  const version = machines.find((m) => m.hardware_version)?.hardware_version ?? null;

  // "Lichtschranke für Speedmessung" etc. aus der freien Ausstattungsliste ist
  // dasselbe wie die abgeleitete Speed-Messung-Kachel - nicht doppelt zeigen.
  const vorhandenGefiltert = vorhanden.filter((item) => {
    if (!hatSpeedmessung) return true;
    const t = item.titel.toLowerCase();
    return !t.includes('speedmessung') && !t.includes('lichtschranke');
  });

  const ausstattungsGruppen = useMemo(() => {
    const gruppen: Record<Gruppe, { sub: string; label: string; value: string; key: string; action?: ReactNode }[]> = {
      Hardware: [],
      Materialien: [],
      Software: [],
      Wartung: [],
      Support: [],
      Services: [],
    };

    gruppen.Hardware.push({
      key: 'automat',
      sub: 'Verkauf',
      label: machines.length > 1 ? `${machines.length} Automaten` : 'Selbstbedienung',
      value: machines.length > 1 ? `${machines.length}x SB-Automat` : 'SB-Automat',
    });
    gruppen.Hardware.push({
      key: 'zahlung',
      sub: 'Verkauf',
      label: version ? `Version ${version === 'neu' ? 'Neu' : 'Alt'}` : 'Zahlungsart',
      value: istNurKarte ? 'Nur Karte' : 'Bar & Karte',
    });
    if (hatSpeedmessung) {
      gruppen.Hardware.push({ key: 'speed', sub: 'Sensorik', label: 'Lichtschranke', value: 'Speed-Messung' });
    }
    if (hatVideo) {
      gruppen.Hardware.push({ key: 'video', sub: 'Aufnahme', label: 'Zusatzfunktion', value: 'Video-Add-on' });
    }
    for (const item of vorhandenGefiltert) {
      const gruppe = KATEGORIE_GRUPPE[item.kategorie] ?? 'Services';
      gruppen[gruppe].push({ key: item.id, sub: item.kategorie, label: item.kategorie, value: item.titel });
    }
    gruppen.Materialien.push({
      key: FOTOPAPIER_KEY,
      sub: 'Verbrauchsmaterial',
      label: 'Fotopapier',
      value: paperRemaining != null ? `${formatNumber(paperRemaining)} Blatt übrig` : '—',
      action: (
        <button
          type="button"
          onClick={() => void handleAnfrage(FOTOPAPIER_KEY, { label: 'Fotopapier nachbestellen' })}
          disabled={requestKey === FOTOPAPIER_KEY || requestedKeys.has(FOTOPAPIER_KEY)}
          className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {anfrageLabel(FOTOPAPIER_KEY, 'Nachbestellen')}
        </button>
      ),
    });

    return gruppen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines, version, istNurKarte, hatSpeedmessung, hatVideo, vorhandenGefiltert, paperRemaining, requestKey, requestedKeys]);

  const empfohlenKategorien = useMemo(
    () => Array.from(new Set(empfohlen.map((i) => i.kategorie))),
    [empfohlen],
  );

  const empfohlenGefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return empfohlen.filter((item) => {
      if (filterKategorie && item.kategorie !== filterKategorie) return false;
      if (!q) return true;
      return item.titel.toLowerCase().includes(q) || (item.beschreibung ?? '').toLowerCase().includes(q);
    });
  }, [empfohlen, suche, filterKategorie]);

  if (!isKioskPark) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Konfiguration</h2>
        <GlassCard className="p-6">
          <p className="text-sm text-slate-500">Diese Seite gilt aktuell nur für Selbstbedienungs-Automaten.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Konfiguration</h2>
          <p className="mt-1 text-sm text-slate-500">Deine aktuelle Ausstattung und was du dazu haben könntest.</p>
        </div>
        <div className="flex items-center gap-2">
          <HeaderIconLink to="/configuration/faq" label="Fragen und Antworten" icon={Info} />
          <Link
            to="/configuration/bestellungen"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Meine Bestellungen
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <SectionCard title="Deine aktuelle Ausstattung">
        {loading ? (
          <p className="mt-4 text-sm text-slate-400">Wird geladen…</p>
        ) : (
          <div className="mt-5 space-y-6">
            {GRUPPEN_REIHENFOLGE.filter((g) => ausstattungsGruppen[g].length > 0).map((gruppe) => (
              <div key={gruppe}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{gruppe}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {ausstattungsGruppen[gruppe].map((tile) => (
                    <SpecTile key={tile.key} sub={tile.sub} label={tile.label} value={tile.value} action={tile.action} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {!loading && empfohlen.length > 0 && (
        <SectionCard title="Mehr aus deinem Automaten holen">
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder="Produkte durchsuchen…"
                className="w-full rounded-lg border border-slate-200 bg-white/70 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFilterKategorie(null)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  filterKategorie === null ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Alle
              </button>
              {empfohlenKategorien.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilterKategorie(k)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    filterKategorie === k ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {empfohlenGefiltert.map((item) => {
              const Icon = KATEGORIE_ICON[item.kategorie] ?? Gauge;
              return (
                <div
                  key={item.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-slate-200/60 bg-white/70"
                >
                  {galerieBilder(item).length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setGalerie({ item, index: 0 })}
                      className="group relative h-44 w-full shrink-0 overflow-hidden bg-slate-100"
                      aria-label={`${item.titel}: Bilder ansehen`}
                    >
                      <img src={item.image_url ?? ''} alt={item.titel} className="h-full w-full object-cover" />
                      <span className="absolute bottom-2 right-2 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold text-white group-hover:bg-slate-900">
                        3 Bilder ansehen
                      </span>
                    </button>
                  ) : item.before_image_url && item.after_image_url ? (
                    <div className="h-44 w-full shrink-0">
                      <BeforeAfterSlider beforeUrl={item.before_image_url} afterUrl={item.after_image_url} />
                    </div>
                  ) : item.image_url ? (
                    <div className="h-44 w-full shrink-0 overflow-hidden bg-slate-100">
                      <img src={item.image_url} alt={item.titel} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-44 w-full shrink-0 items-center justify-center bg-slate-50">
                      <Icon className="h-8 w-8 text-slate-300" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      <Icon className="h-3 w-3" />
                      {item.kategorie}
                    </span>
                    <p className="text-sm font-semibold text-slate-800">{item.titel}</p>
                    {item.beschreibung && (
                      <p className="line-clamp-2 text-sm text-slate-500">{item.beschreibung}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {item.mehrwert_text && (
                        <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                          {item.mehrwert_text}
                        </span>
                      )}
                      {item.geschaetzter_mehrumsatz_cents != null && (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          +{(item.geschaetzter_mehrumsatz_cents / 100).toLocaleString('de-DE')} €/Monat
                        </span>
                      )}
                    </div>
                    <div className="mt-auto flex flex-col gap-2 pt-2">
                      {item.preview_url && (
                        <a
                          href={item.preview_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Vorschau ansehen
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleAnfrage(item.id, { itemId: item.id })}
                        disabled={requestKey === item.id || requestedKeys.has(item.id)}
                        className="inline-flex w-full items-center justify-center rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60"
                      >
                        {anfrageLabel(item.id)}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {empfohlenGefiltert.length === 0 && (
              <p className="col-span-full text-sm text-slate-400">Keine Treffer für diese Suche/Filter.</p>
            )}
          </div>
        </SectionCard>
      )}

      {galerie && (() => {
        const bilder = galerieBilder(galerie.item);
        const aktuell = bilder[galerie.index] ?? bilder[0];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
            onClick={() => setGalerie(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-base font-semibold text-slate-800">{galerie.item.titel}</p>
                  {galerie.item.mehrwert_text && (
                    <p className="mt-0.5 text-sm text-slate-500">{galerie.item.mehrwert_text}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setGalerie(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Schließen"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-3">
                <img src={aktuell} alt={galerie.item.titel} className="max-h-[60vh] w-auto max-w-full object-contain" />
              </div>
              <div className="flex gap-2 overflow-x-auto border-t border-slate-100 px-5 py-3">
                {bilder.map((url, index) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setGalerie({ item: galerie.item, index })}
                    className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 bg-white ${
                      index === galerie.index ? 'border-sky-500' : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                    aria-label={`Bild ${index + 1}`}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
              {galerie.item.beschreibung && (
                <p className="border-t border-slate-100 px-5 py-3 text-sm leading-relaxed text-slate-600">
                  {galerie.item.beschreibung}
                </p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
