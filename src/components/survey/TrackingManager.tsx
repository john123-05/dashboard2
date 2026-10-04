import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { fetchTrackingSettings, saveTrackingSettings, type TrackingSettings } from '../../lib/surveyApi';

const EMPTY: TrackingSettings = { meta_pixel_id: '', google_ads_id: '', enabled: false };

export default function TrackingManager({ parkId }: { parkId: string }) {
  const [settings, setSettings] = useState<TrackingSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSettings(EMPTY);
    setDirty(false);
    setSaved(false);
    setError(null);
    fetchTrackingSettings(parkId)
      .then((value) => { if (active) { setSettings(value); setError(null); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Laden fehlgeschlagen.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [parkId]);

  const update = (next: Partial<TrackingSettings>) => {
    setSettings((current) => ({ ...current, ...next }));
    setDirty(true);
    setSaved(false);
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const value = await saveTrackingSettings(parkId, settings);
      setSettings(value);
      setDirty(false);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard className="max-w-3xl p-5 sm:p-6">
      <h3 className="text-base font-semibold text-slate-800">Werbe-Pixel</h3>
      <p className="mt-2 text-sm text-slate-600">
        Pixel für deine Foto-Abholseite. Diese Einstellung funktioniert unabhängig davon, wie Gäste ihr Foto freischalten.
        Die Tags werden erst geladen, wenn ein Gast Werbe-Tracking zustimmt.
      </p>
      {loading ? <Loader2 className="mt-5 h-5 w-5 animate-spin text-slate-500" /> : (
        <div className="mt-5 space-y-4">
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white/60 p-3 text-sm text-slate-700">
            <input type="checkbox" checked={settings.enabled} onChange={(event) => update({ enabled: event.target.checked })} className="mt-0.5" />
            <span><strong className="block">Pixel aktivieren</strong>Nach dem Speichern gilt die Einstellung für neue Besuche der Abholseite.</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Meta-Pixel-ID
              <input
                value={settings.meta_pixel_id}
                onChange={(event) => update({ meta_pixel_id: event.target.value.trim() })}
                inputMode="numeric"
                placeholder="z. B. 123456789012345"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Google Ads-ID
              <input
                value={settings.google_ads_id}
                onChange={(event) => update({ google_ads_id: event.target.value.trim().toUpperCase() })}
                placeholder="AW-123456789"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">Mindestens eine ID ist zum Aktivieren nötig. Diese Version erfasst Seitenaufrufe; Ereignisse wie Kauf oder Foto-Freischaltung folgen separat.</p>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void save()} disabled={saving || !dirty} className="glass-button-primary disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Speichern
            </button>
            {saved && !dirty && <span className="flex items-center gap-1 text-sm text-emerald-700"><Check className="h-4 w-4" /> Gespeichert</span>}
            {dirty && <span className="text-sm text-amber-700">Nicht gespeicherte Änderungen</span>}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
