import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import { usePark } from '../contexts/ParkContext';
import { loadParkDashboardData } from '../lib/parkDashboard';
import { meldeAusstattungsInteresse } from '../lib/equipment';
import { formatNumber } from '../lib/utils';

const FOTOPAPIER_KEY = '__fotopapier__';

/** Eigene Seite fuer Verbrauchsmaterial, erreichbar ueber das Symbol auf "Konfiguration". */
export default function ConfigurationMaterials() {
  const { parkId } = usePark();
  const [paperRemaining, setPaperRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!parkId) return;
    let active = true;
    setLoading(true);
    loadParkDashboardData(parkId)
      .then((res) => active && setPaperRemaining(res.data?.summary.printer_paper_remaining ?? null))
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [parkId]);

  async function handleAnfrage() {
    if (!parkId) return;
    setSending(true);
    try {
      await meldeAusstattungsInteresse(parkId, { label: 'Fotopapier nachbestellen' });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anfrage fehlgeschlagen.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/configuration" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-3.5 w-3.5" />
          Zurück zur Konfiguration
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-800">Materialien</h2>
        <p className="mt-1 text-sm text-slate-500">Verbrauchsmaterial für deinen Automaten.</p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <GlassCard className="p-5 sm:p-6">
        {loading ? (
          <p className="text-sm text-slate-400">Wird geladen…</p>
        ) : (
          <div className="flex items-center justify-between gap-4 rounded-xl bg-white/60 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-50 p-2.5">
                <Printer className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Fotopapier</p>
                <p className="text-xs text-slate-500">Verbrauchsmaterial</p>
                <p className="mt-1 text-2xl font-bold text-slate-800">
                  {paperRemaining != null ? formatNumber(paperRemaining) : '—'}
                  <span className="ml-1 text-sm font-normal text-slate-500">Blatt übrig</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleAnfrage()}
              disabled={sending || sent}
              className="shrink-0 rounded-lg bg-slate-800 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {sent ? 'Anfrage gesendet' : sending ? 'Wird gesendet…' : 'Jetzt anfragen'}
            </button>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
