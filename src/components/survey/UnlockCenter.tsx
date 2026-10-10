import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import SurveyManager from './SurveyManager';
import SocialManager from './SocialManager';
import TrackingManager from './TrackingManager';
import { fetchSurveyConfig, setUnlockMode, type SurveyConfig, type UnlockMode } from '../../lib/surveyApi';
import { CRM_TABS, crmTabForPath, type TabKey } from '../../lib/crmTabs';
import { useI18n } from '../../lib/i18n';

export type { TabKey };

const TABS = CRM_TABS;

export default function UnlockCenter({
  parkId,
  routed = true,
  children,
}: {
  parkId: string;
  /** false: Reiter nur als Zustand (eingebettete Ansicht im Staff-Dashboard). */
  routed?: boolean;
  children: (view: 'overview' | 'list') => ReactNode;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [config, setConfig] = useState<SurveyConfig | null>(null);
  const [localTab, setLocalTab] = useState<TabKey>('overview');
  const tab = routed ? crmTabForPath(pathname) : localTab;

  function openTab(next: TabKey) {
    if (!routed) {
      setLocalTab(next);
      return;
    }
    navigate(CRM_TABS.find((x) => x.key === next)?.path ?? '/leads');
  }
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
                onClick={() => openTab(tabItem.key)}
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
