import { useEffect, useState, type ReactNode } from 'react';
import { Camera, CreditCard, Gauge, Printer, Server, ShoppingBag, Video } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import BeforeAfterSlider from '../components/ui/BeforeAfterSlider';
import OrderStatusStepper from '../components/ui/OrderStatusStepper';
import { usePark } from '../contexts/ParkContext';
import { ladeZahlungen, type ZahlungsAutomat } from '../lib/zahlungen';
import { loadParkDashboardData } from '../lib/parkDashboard';
import { fetchParkEquipment, meldeAusstattungsInteresse, type EquipmentItem } from '../lib/equipment';
import { formatNumber } from '../lib/utils';

const KATEGORIE_ICON: Record<string, typeof Camera> = {
  Automat: Server,
  Kamera: Camera,
  Zubehoer: Printer,
  Software: Gauge,
  Webshop: ShoppingBag,
  Sonstiges: Gauge,
};

const FOTOPAPIER_KEY = '__fotopapier__';

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <GlassCard className="p-5 sm:p-6">
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      {children}
    </GlassCard>
  );
}

function SpecTile({
  icon: Icon,
  label,
  value,
  sub,
  action,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white/60 p-4">
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-slate-400" />
        {action}
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-slate-800">{value}</p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
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

  if (!isKioskPark) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Konfiguration</h2>
        <GlassCard className="p-6">
          <p className="text-sm text-slate-500">Diese Seite gilt aktuell nur für Selbstbedienungs-Automaten.</p>
        </GlassCard>
      </div>
    );
  }

  const vorhanden = items.filter((i) => i.status === 'vorhanden');
  const empfohlen = items.filter((i) => i.status === 'empfohlen');
  const bestellt = items.filter((i) => i.status === 'bestellt');
  const cardOnlyCount = machines.filter((m) => m.card_only).length;
  const istNurKarte = machines.length > 0 && cardOnlyCount === machines.length;
  const hatSpeedmessung = machines.some((m) => m.speed_enabled);
  const hatVideo = machines.some((m) => m.video_enabled);
  const version = machines.find((m) => m.hardware_version)?.hardware_version ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Konfiguration</h2>
        <p className="mt-1 text-sm text-slate-500">Deine aktuelle Ausstattung und was du dazu haben könntest.</p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <SectionCard title="Deine aktuelle Ausstattung">
        {loading ? (
          <p className="mt-4 text-sm text-slate-400">Wird geladen…</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SpecTile
              icon={Server}
              label="Automat"
              value={machines.length > 1 ? `${machines.length}x SB-Automat` : 'SB-Automat'}
              sub={version ? `Version ${version === 'neu' ? 'Neu' : 'Alt'}` : undefined}
            />
            <SpecTile icon={CreditCard} label="Zahlungsart" value={istNurKarte ? 'Nur Karte' : 'Bar & Karte'} />
            {hatSpeedmessung && <SpecTile icon={Gauge} label="Speed-Messung" value="Vorhanden" />}
            {hatVideo && <SpecTile icon={Video} label="Video-Add-on" value="Vorhanden" />}
            <SpecTile
              icon={Printer}
              label="Fotopapier"
              value={paperRemaining != null ? formatNumber(paperRemaining) : '—'}
              action={
                <button
                  type="button"
                  onClick={() => void handleAnfrage(FOTOPAPIER_KEY, { label: 'Fotopapier nachbestellen' })}
                  disabled={requestKey === FOTOPAPIER_KEY || requestedKeys.has(FOTOPAPIER_KEY)}
                  className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                >
                  {anfrageLabel(FOTOPAPIER_KEY, 'Nachbestellen')}
                </button>
              }
            />
            {vorhanden.map((item) => {
              const Icon = KATEGORIE_ICON[item.kategorie] ?? Gauge;
              return <SpecTile key={item.id} icon={Icon} label={item.kategorie} value={item.titel} />;
            })}
          </div>
        )}
      </SectionCard>

      {!loading && empfohlen.length > 0 && (
        <SectionCard title="Mehr aus deinem Automaten holen">
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {empfohlen.map((item) => {
              const Icon = KATEGORIE_ICON[item.kategorie] ?? Gauge;
              return (
                <div
                  key={item.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-slate-200/60 bg-white/70"
                >
                  {item.before_image_url && item.after_image_url ? (
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
                    <div className="mt-auto pt-2">
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
          </div>
        </SectionCard>
      )}

      <SectionCard title="Meine Bestellungen" subtitle="Fortschritt deiner laufenden Bestellungen">
        {loading ? (
          <p className="mt-4 text-sm text-slate-400">Wird geladen…</p>
        ) : bestellt.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">Aktuell nichts bestellt.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {bestellt.map((item) => {
              const Icon = KATEGORIE_ICON[item.kategorie] ?? Gauge;
              return (
                <div key={item.id} className="rounded-xl bg-white/60 p-4">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-sky-50 p-1.5">
                      <Icon className="h-4 w-4 text-sky-600" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800">{item.titel}</p>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <OrderStatusStepper status={item.bestellstatus ?? 'bestellung_erhalten'} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
