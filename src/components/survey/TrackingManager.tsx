import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import GlassCard from '../ui/GlassCard';
import { fetchTrackingSettings, saveTrackingSettings, type TrackingSettings } from '../../lib/surveyApi';

const EMPTY: TrackingSettings = { meta_pixel_id: '', google_ads_id: '', enabled: false };

export default function TrackingManager({ parkId }: { parkId: string }) {
  const { t } = useI18n();
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
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : t('survey.load_failed')); })
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
      setError(reason instanceof Error ? reason.message : t('survey.save_failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard className="max-w-3xl p-5 sm:p-6">
      <h3 className="text-base font-semibold text-slate-800">{t('tracking.title')}</h3>
      <p className="mt-2 text-sm text-slate-600">
        {t('tracking.intro')}
      </p>
      {loading ? <Loader2 className="mt-5 h-5 w-5 animate-spin text-slate-500" /> : (
        <div className="mt-5 space-y-4">
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white/60 p-3 text-sm text-slate-700">
            <input type="checkbox" checked={settings.enabled} onChange={(event) => update({ enabled: event.target.checked })} className="mt-0.5" />
            <span><strong className="block">{t('tracking.enable')}</strong>{t('tracking.enable_note')}</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              {t('tracking.meta_id')}
              <input
                value={settings.meta_pixel_id}
                onChange={(event) => update({ meta_pixel_id: event.target.value.trim() })}
                inputMode="numeric"
                placeholder={t('tracking.meta_placeholder')}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              {t('tracking.google_id')}
              <input
                value={settings.google_ads_id}
                onChange={(event) => update({ google_ads_id: event.target.value.trim().toUpperCase() })}
                placeholder="AW-123456789"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">{t('tracking.note')}</p>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void save()} disabled={saving || !dirty} className="glass-button-primary disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} {t('survey.save')}
            </button>
            {saved && !dirty && <span className="flex items-center gap-1 text-sm text-emerald-700"><Check className="h-4 w-4" /> {t('tracking.saved')}</span>}
            {dirty && <span className="text-sm text-amber-700">{t('survey.unsaved')}</span>}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
