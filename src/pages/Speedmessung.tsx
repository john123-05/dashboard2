import { useEffect, useState } from 'react';
import { Gauge, TrendingDown, TrendingUp } from 'lucide-react';
import KPICard from '../components/ui/KPICard';
import GlassCard from '../components/ui/GlassCard';
import { usePark } from '../contexts/ParkContext';
import { fetchTodaysSpeeds } from '../lib/photoBrowser';

function formatSpeed(value: number | null): string {
  return value != null ? `${value.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km/h` : '—';
}

/** Zeigt den schnellsten/langsamsten/durchschnittlichen Speedwert von heute - unabhängig vom Kauf. */
export default function Speedmessung() {
  const { parkId, isKioskPark, kioskTimezone } = usePark();
  const [speeds, setSpeeds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!parkId) return;
    let active = true;
    setLoading(true);
    fetchTodaysSpeeds(parkId, kioskTimezone)
      .then((v) => active && setSpeeds(v))
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [parkId, kioskTimezone]);

  if (!isKioskPark) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Speedmessung</h2>
        <GlassCard className="p-6">
          <p className="text-sm text-slate-500">Diese Seite gilt aktuell nur für Selbstbedienungs-Automaten.</p>
        </GlassCard>
      </div>
    );
  }

  const schnellster = speeds.length ? Math.max(...speeds) : null;
  const langsamster = speeds.length ? Math.min(...speeds) : null;
  const durchschnitt = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Speedmessung</h2>
        <p className="mt-1 text-sm text-slate-500">
          Geschwindigkeiten von heute - unabhängig davon, ob ein Foto gekauft wurde.
        </p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KPICard
          title="Schnellster heute"
          value={loading ? '…' : formatSpeed(schnellster)}
          icon={TrendingUp}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <KPICard
          title="Langsamster heute"
          value={loading ? '…' : formatSpeed(langsamster)}
          icon={TrendingDown}
          iconColor="text-rose-600"
          iconBg="bg-rose-50"
        />
        <KPICard
          title="Durchschnitt heute"
          value={loading ? '…' : formatSpeed(durchschnitt)}
          subtitle={!loading ? `${speeds.length} Messung${speeds.length === 1 ? '' : 'en'}` : undefined}
          icon={Gauge}
          iconColor="text-sky-600"
          iconBg="bg-sky-50"
        />
      </div>

      {!loading && speeds.length === 0 && (
        <GlassCard className="p-6">
          <p className="text-sm text-slate-500">Heute noch keine Geschwindigkeits-Messwerte.</p>
        </GlassCard>
      )}
    </div>
  );
}
