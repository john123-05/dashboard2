import { useEffect, useState } from 'react';
import { Camera, CreditCard, Gauge, Printer, Server } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import { usePark } from '../contexts/ParkContext';
import { fetchMachineRevenue, type MachineRevenue } from '../lib/kioskSales';
import { loadParkDashboardData } from '../lib/parkDashboard';
import { fetchRecentPhotos } from '../lib/photoBrowser';
import { fetchParkEquipment, type EquipmentItem } from '../lib/equipment';
import { formatNumber } from '../lib/utils';

const KATEGORIE_ICON: Record<string, typeof Camera> = {
  Automat: Server,
  Kamera: Camera,
  Zubehoer: Printer,
  Software: Gauge,
  Sonstiges: Gauge,
};

export default function Configuration() {
  const { parkId, isKioskPark } = usePark();
  const [machines, setMachines] = useState<MachineRevenue[]>([]);
  const [paperRemaining, setPaperRemaining] = useState<number | null>(null);
  const [hasSpeedMeasurement, setHasSpeedMeasurement] = useState<boolean | null>(null);
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!parkId) return;
    let active = true;
    setLoading(true);
    Promise.all([
      fetchMachineRevenue(parkId).catch(() => []),
      loadParkDashboardData(parkId).catch(() => ({ data: null, error: null })),
      fetchRecentPhotos(parkId, 20).catch(() => []),
      fetchParkEquipment(parkId).catch(() => []),
    ])
      .then(([machineRows, parkDashboard, recentPhotos, equipmentItems]) => {
        if (!active) return;
        setMachines(machineRows);
        setPaperRemaining(parkDashboard.data?.summary.printer_paper_remaining ?? null);
        setHasSpeedMeasurement(
          recentPhotos.length === 0 ? null : recentPhotos.some((p) => p.speedKmh !== null),
        );
        setItems(equipmentItems);
        setError(null);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [parkId]);

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
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl bg-white/50 p-4">
              <Server className="h-5 w-5 text-slate-500" />
              <p className="mt-2 text-lg font-semibold text-slate-800">
                {machines.length > 0 ? formatNumber(machines.length) : '1'}
              </p>
              <p className="text-xs text-slate-500">{machines.length === 1 ? 'Automat' : 'Automaten'}</p>
            </div>
            <div className="rounded-xl bg-white/50 p-4">
              <CreditCard className="h-5 w-5 text-slate-500" />
              <p className="mt-2 text-lg font-semibold text-slate-800">
                {cardOnlyCount === machines.length && machines.length > 0 ? 'Nur Karte' : 'Bar & Karte'}
              </p>
              <p className="text-xs text-slate-500">Zahlungsarten</p>
            </div>
            <div className="rounded-xl bg-white/50 p-4">
              <Gauge className="h-5 w-5 text-slate-500" />
              <p className="mt-2 text-lg font-semibold text-slate-800">
                {hasSpeedMeasurement === null ? '—' : hasSpeedMeasurement ? 'Vorhanden' : 'Keine'}
              </p>
              <p className="text-xs text-slate-500">Speedmessung</p>
            </div>
            <div className="rounded-xl bg-white/50 p-4">
              <Printer className="h-5 w-5 text-slate-500" />
              <p className="mt-2 text-lg font-semibold text-slate-800">
                {paperRemaining != null ? formatNumber(paperRemaining) : '—'}
              </p>
              <p className="text-xs text-slate-500">Fotopapier übrig</p>
            </div>
          </div>
        )}
      </GlassCard>

      {!loading && empfohlen.length > 0 && (
        <GlassCard className="p-5 sm:p-6">
          <h3 className="text-base font-semibold text-slate-800">Empfohlen für dich</h3>
          <div className="mt-4 space-y-3">
            {empfohlen.map((item) => {
              const Icon = KATEGORIE_ICON[item.kategorie] ?? Gauge;
              return (
                <div key={item.id} className="flex items-start gap-3 rounded-xl bg-white/50 p-4">
                  <div className="rounded-lg bg-sky-50 p-2">
                    <Icon className="h-4 w-4 text-sky-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{item.titel}</p>
                    {item.beschreibung && <p className="mt-0.5 text-sm text-slate-500">{item.beschreibung}</p>}
                    {item.geschaetzter_mehrumsatz_cents != null && (
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        +{(item.geschaetzter_mehrumsatz_cents / 100).toLocaleString('de-DE')} € geschätzter Mehrumsatz/Monat
                      </p>
                    )}
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
