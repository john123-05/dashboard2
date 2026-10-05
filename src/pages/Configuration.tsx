import { useEffect, useState } from 'react';
import { Camera, CreditCard, Gauge, Printer, Server, ShoppingBag, Video } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import BeforeAfterSlider from '../components/ui/BeforeAfterSlider';
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

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
      {children}
    </span>
  );
}

export default function Configuration() {
  const { parkId, isKioskPark } = usePark();
  const [machines, setMachines] = useState<ZahlungsAutomat[]>([]);
  const [paperRemaining, setPaperRemaining] = useState<number | null>(null);
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interestId, setInterestId] = useState<string | null>(null);
  const [interestDone, setInterestDone] = useState<Set<string>>(new Set());

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

  async function handleInteresse(itemId: string) {
    if (!parkId) return;
    setInterestId(itemId);
    try {
      await meldeAusstattungsInteresse(parkId, itemId);
      setInterestDone((prev) => new Set(prev).add(itemId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anfrage fehlgeschlagen.');
    } finally {
      setInterestId(null);
    }
  }

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

  const vorhanden = items.filter((i) => i.status === 'vorhanden');
  const empfohlen = items.filter((i) => i.status === 'empfohlen');
  const cardOnlyCount = machines.filter((m) => m.card_only).length;
  const istNurKarte = machines.length > 0 && cardOnlyCount === machines.length;
  const hatSpeedmessung = machines.some((m) => m.speed_enabled);
  const hatVideo = machines.some((m) => m.video_enabled);
  const version = machines.find((m) => m.hardware_version)?.hardware_version ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Konfiguration</h2>
        <p className="mt-1 text-sm text-slate-500">Deine aktuelle Ausstattung und was du dazu haben könntest.</p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <GlassCard className="p-5 sm:p-6">
        <h3 className="text-base font-semibold text-slate-800">Deine aktuelle Konfiguration</h3>
        {loading ? (
          <p className="mt-4 text-sm text-slate-400">Wird geladen…</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl bg-white/60 px-4 py-2">
                <Server className="h-5 w-5 text-slate-500" />
                <span className="text-lg font-semibold text-slate-800">
                  {machines.length > 1 ? `${machines.length} SB-Automaten` : 'SB-Automat'}
                </span>
                {version && <Chip>Version: {version === 'neu' ? 'Neu' : 'Alt'}</Chip>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip>
                <CreditCard className="h-3.5 w-3.5" />
                {istNurKarte ? 'Nur Karte' : 'Bar & Karte'}
              </Chip>
              {hatSpeedmessung && (
                <Chip>
                  <Gauge className="h-3.5 w-3.5" />
                  Speed-Messung
                </Chip>
              )}
              {hatVideo && (
                <Chip>
                  <Video className="h-3.5 w-3.5" />
                  Video-Add-on
                </Chip>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-white/50 p-4">
              <div className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-slate-500" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {paperRemaining != null ? `${formatNumber(paperRemaining)} Fotopapier übrig` : 'Fotopapier'}
                  </p>
                  <p className="text-xs text-slate-500">Bestand wird aus deinen Automaten gemeldet.</p>
                </div>
              </div>
              <a
                href="mailto:info@liftpictures.com?subject=Fotopapier%20nachbestellen"
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
              >
                Nachbestellen
              </a>
            </div>
          </>
        )}
      </GlassCard>

      {!loading && empfohlen.length > 0 && (
        <GlassCard className="p-5 sm:p-6">
          <h3 className="text-base font-semibold text-slate-800">Mehr aus deinem Automaten holen</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {empfohlen.map((item) => {
              const Icon = KATEGORIE_ICON[item.kategorie] ?? Gauge;
              const angefragt = interestDone.has(item.id);
              return (
                <div key={item.id} className="flex flex-col overflow-hidden rounded-xl bg-white/60">
                  {item.before_image_url && item.after_image_url ? (
                    <BeforeAfterSlider beforeUrl={item.before_image_url} afterUrl={item.after_image_url} />
                  ) : item.image_url ? (
                    <img src={item.image_url} alt={item.titel} className="aspect-video w-full object-cover" />
                  ) : null}
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-sky-50 p-1.5">
                        <Icon className="h-4 w-4 text-sky-600" />
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{item.titel}</p>
                    </div>
                    {item.beschreibung && <p className="text-sm text-slate-500">{item.beschreibung}</p>}
                    {item.geschaetzter_mehrumsatz_cents != null && (
                      <p className="text-xs font-medium text-emerald-700">
                        +{(item.geschaetzter_mehrumsatz_cents / 100).toLocaleString('de-DE')} € geschätzte
                        Umsatzsteigerung/Monat
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleInteresse(item.id)}
                      disabled={interestId === item.id || angefragt}
                      className="mt-auto inline-flex w-fit items-center justify-center rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60"
                    >
                      {angefragt ? 'Anfrage gesendet' : interestId === item.id ? 'Wird gesendet…' : 'Interesse anmelden'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {!loading && vorhanden.length > 0 && (
        <GlassCard className="p-5 sm:p-6">
          <h3 className="text-base font-semibold text-slate-800">Bereits vorhanden</h3>
          <ul className="mt-4 space-y-2">
            {vorhanden.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm text-slate-700">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                {item.titel}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {!loading && items.length === 0 && (
        <p className="text-sm text-slate-400">Noch keine Empfehlungen hinterlegt.</p>
      )}
    </div>
  );
}
