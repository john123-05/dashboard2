import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import SurveyManager from './SurveyManager';
import SocialManager from './SocialManager';
import TrackingManager from './TrackingManager';
import { fetchSurveyConfig, setUnlockMode, type SurveyConfig, type UnlockMode } from '../../lib/surveyApi';
import { useI18n } from '../../lib/i18n';

export type TabKey = 'overview' | 'allContacts' | 'survey' | 'social' | 'tracking';

const TABS: { key: TabKey; mode?: UnlockMode; labelKey: string }[] = [
  { key: 'overview', labelKey: 'nav.overview' },
  { key: 'allContacts', mode: 'email', labelKey: 'leads.title' },
  { key: 'survey', mode: 'survey', labelKey: 'crm.tab_survey' },
  { key: 'social', mode: 'social', labelKey: 'crm.tab_social' },
  { key: 'tracking', labelKey: 'crm.tab_tracking' },
];

/**
 * CRM-Kopf: eine Leiste mit den drei Wegen zum Freischalten (E-Mail / Telefon,
 * Umfrage, Social Media). Ein Punkt markiert den Weg, den Gäste gerade sehen;
 * „Aktivieren“ stellt den angezeigten Weg live. E-Mail/Telefon hat keinen
 * eigenen Reiter mehr - die Kontaktfeld-Einstellungen leben jetzt direkt im
 * "Kontakte"-Reiter (children), der auch den E-Mail-Modus aktiviert. Pixel
 * ist ein eigener Reiter ohne Freischaltmodus.
 */
export default function UnlockCenter({
  parkId,
  children,
}: {
  parkId: string;
  children: (view: 'overview' | 'list') => ReactNode;
}) {
  const { t } = useI18n();
  const [config, setConfig] = useState<SurveyConfig | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');
  const [busy, setBusy] = useState<UnlockMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const c = await fetchSurveyConfig(parkId);
      setConfig(c);
      setError(null);
      return c;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('crm.load_failed'));
      return null;
    }
  }, [parkId, t]);

  useEffect(() => {
    // Übersicht is the landing tab regardless of which mode happens to be
    // live - it's the one place that already shows what's active.
    void load();
  }, [load]);

  async function activate(mode: UnlockMode) {
    if (!config || busy) return;
    setBusy(mode);
    setError(null);
    try {
      setConfig(await setUnlockMode(parkId, mode));
    } catch (e) {
      // z. B. Umfrage ohne Fragen: die Meldung sagt, was fehlt.
      setError(e instanceof Error ? e.message : t('crm.switch_failed'));
    }
    setBusy(null);
  }

  const active = config?.settings.mode;
  const shown = TABS.find((t) => t.key === tab);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">{tab === 'overview' ? t('crm.overview_title') : shown ? t(shown.labelKey) : ''}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-white/50 p-1">
            {TABS.map((tabItem) => (
              <button
                key={tabItem.key}
                type="button"
                onClick={() => setTab(tabItem.key)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                  tab === tabItem.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {active === tabItem.mode && <span className="h-2 w-2 rounded-full bg-emerald-500" title={t('crm.active_for_guests')} />}
                {t(tabItem.labelKey)}
              </button>
            ))}
          </div>
          {tab === 'overview' && (
            <Link
              to="/leads/preise"
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {t('shop.view_plans')}
            </Link>
          )}
          {shown?.mode && active !== shown.mode && (
            <button
              type="button"
              onClick={() => { if (shown.mode) void activate(shown.mode); }}
              disabled={!config || busy !== null}
              className="glass-button-secondary"
            >
              {busy === shown.mode ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('crm.activate_for_guests')}
            </button>
          )}
        </div>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {tab === 'overview' && <div className="space-y-5">{children('overview')}</div>}
      {tab === 'allContacts' && <div className="space-y-5">{children('list')}</div>}
      {tab === 'survey' && <SurveyManager parkId={parkId} />}
      {tab === 'social' && config && (
        <SocialManager parkId={parkId} initial={config.settings.social ?? {}} onSaved={() => void load()} />
      )}
      {tab === 'tracking' && <TrackingManager parkId={parkId} />}
    </div>
  );
}
