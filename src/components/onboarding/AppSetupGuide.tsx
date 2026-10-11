import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AppWindow, Bell, CheckCircle2, ChevronLeft, ChevronRight, Download, Laptop, MonitorDown, MoreVertical, RotateCcw,
  PlusSquare, Share, Smartphone, Star,
} from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { usePark } from '../../contexts/ParkContext';
import {
  BROWSERS, canPromptInstall, detectDevice, isStandalone, onInstallPromptChange, promptInstall, type Browser, type Device,
} from '../../lib/installPrompt';
import { getCurrentOperatorPushSubscription, isOperatorPushSupported, subscribeOperatorPush } from '../../lib/operatorPushNotifications';
import { useOnboarding } from '../../lib/onboarding';

// Anleitung „Liftbase als App hinzufügen und Benachrichtigungen einschalten“ – für iPhone, Android, Mac und Windows,
// passend zum Browser. Links eine kleine bewegte Skizze (wohin tippen/klicken), rechts der Schritt in Worten.
// Wo der Browser es kann, gibt es echte Knöpfe: „Jetzt installieren“ und „Benachrichtigungen einschalten“.

type Scene =
  | 'ios-share-bottom' | 'ios-share-top' | 'ios-sheet' | 'ios-add' | 'home-icon'
  | 'android-dots' | 'android-menu' | 'install-dialog'
  | 'desk-address' | 'desk-edge' | 'desk-dialog' | 'safari-file' | 'safari-dock' | 'ff-note'
  | 'notify-button' | 'notify-prompt';
type Step = { part: 'install' | 'notify'; scene: Scene; textKey: string };

const DEVICE_KEY = 'lp-app-device';
const BROWSER_LABEL: Record<Browser, string> = { safari: 'Safari', chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox' };

function stepsFor(device: Device, browser: Browser): Step[] {
  const notify: Step[] = [
    { part: 'notify', scene: 'notify-button', textKey: 'app.not_1' },
    { part: 'notify', scene: 'notify-prompt', textKey: device === 'iphone' ? 'app.not_2_ios' : 'app.not_2' },
  ];
  const install = (items: [Scene, string][]): Step[] => items.map(([scene, textKey]) => ({ part: 'install', scene, textKey }));
  if (device === 'iphone') {
    return [
      ...install([
        browser === 'chrome' ? ['ios-share-top', 'app.ios_c1'] : ['ios-share-bottom', 'app.ios_s1'],
        ['ios-sheet', 'app.ios_2'], ['ios-add', 'app.ios_3'], ['home-icon', 'app.home_4'],
      ]),
      ...notify,
    ];
  }
  if (device === 'android') {
    return [...install([['android-dots', 'app.and_1'], ['android-menu', 'app.and_2'], ['install-dialog', 'app.and_3'], ['home-icon', 'app.home_4']]), ...notify];
  }
  if (browser === 'firefox') return [...install([['ff-note', 'app.ff_1']]), ...notify];
  if (browser === 'safari') return [...install([['safari-file', 'app.safari_1'], ['safari-dock', 'app.safari_2']]), ...notify];
  if (browser === 'edge') return [...install([['desk-edge', 'app.edge_1'], ['desk-dialog', 'app.desk_2']]), ...notify];
  return [...install([['desk-address', 'app.desk_1'], ['desk-dialog', 'app.desk_2']]), ...notify];
}

/** Markiertes Ziel: Rahmen pulsiert, ein Zeiger kommt und „tippt“. */
function Hot({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <span className="absolute -inset-1 animate-pulse rounded-md ring-2 ring-brand-500" aria-hidden />
      {children}
      <span className="lp-pointer pointer-events-none absolute -bottom-3 -right-2 h-4 w-4 rounded-full border-2 border-white bg-brand-600 shadow-md" aria-hidden />
    </span>
  );
}

const Lines = ({ rows = 3 }: { rows?: number }) => (
  <div className="space-y-1.5" aria-hidden>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-1.5 rounded-full bg-slate-200" style={{ width: `${[92, 70, 82, 55, 76][i % 5]}%` }} />
    ))}
  </div>
);

function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto h-[252px] w-[140px] overflow-hidden rounded-[24px] border-[5px] border-slate-800 bg-white text-[8px] text-slate-600 shadow-lg">
      {children}
    </div>
  );
}

function Desk({ address, menuBar, children }: { address?: ReactNode; menuBar?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[380px] text-[9px] text-slate-600">
      {menuBar}
      <div className="relative h-[190px] overflow-hidden rounded-lg border border-slate-300 bg-white shadow-md">
        <div className="flex h-7 items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-2">
          <span className="h-2 w-2 rounded-full bg-rose-300" /><span className="h-2 w-2 rounded-full bg-amber-300" /><span className="h-2 w-2 rounded-full bg-emerald-300" />
          <span className="ml-1 flex h-4 min-w-0 flex-1 items-center justify-between gap-1 rounded bg-white px-1.5">
            <span className="truncate">dashboard-liftpictures.com</span>
            {address}
          </span>
        </div>
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}

const AppIcon = ({ size = 28 }: { size?: number }) => (
  <img src="/icon-192.png" alt="" width={size} height={size} className="rounded-[22%] shadow-sm" />
);

function SceneView({ scene, device }: { scene: Scene; device: Device }) {
  const { t } = useI18n();
  const phone = device === 'iphone' || device === 'android';
  const urlBar = (right?: ReactNode) => (
    <div className="flex h-7 items-center gap-1 border-b border-slate-200 bg-slate-100 px-2">
      <span className="h-3.5 min-w-0 flex-1 truncate rounded-full bg-white px-1.5 leading-[14px]">dashboard-liftpictures.com</span>
      {right}
    </div>
  );
  switch (scene) {
    case 'ios-share-bottom':
      return (
        <Phone>
          {urlBar()}
          <div className="p-2"><Lines rows={5} /></div>
          <div className="absolute inset-x-0 bottom-0 flex h-9 items-center justify-around border-t border-slate-200 bg-slate-100 px-1">
            <ChevronLeft className="h-3.5 w-3.5 text-sky-600" /><ChevronRight className="h-3.5 w-3.5 text-slate-300" />
            <Hot><Share className="h-3.5 w-3.5 text-sky-600" /></Hot>
            <span className="h-3 w-3 rounded-sm border border-sky-600" /><span className="h-3 w-3 rounded-sm border border-sky-600" />
          </div>
        </Phone>
      );
    case 'ios-share-top':
      return (
        <Phone>
          {urlBar(<Hot><Share className="h-3.5 w-3.5 text-sky-600" /></Hot>)}
          <div className="p-2"><Lines rows={5} /></div>
        </Phone>
      );
    case 'ios-sheet':
      return (
        <Phone>
          <div className="absolute inset-0 bg-slate-900/30" />
          <div className="absolute inset-x-0 bottom-0 h-[72%] space-y-1.5 rounded-t-xl bg-slate-100 p-2">
            <div className="mx-auto h-1 w-8 rounded-full bg-slate-300" />
            <div className="rounded-md bg-white p-1.5"><Lines rows={1} /></div>
            <div className="rounded-md bg-white p-1.5"><Lines rows={1} /></div>
            <Hot className="w-full">
              <span className="flex w-full items-center justify-between gap-1 rounded-md bg-white p-1.5 font-medium text-slate-800">
                {t('app.ui_add_home')} <PlusSquare className="h-3 w-3 shrink-0" />
              </span>
            </Hot>
            <div className="rounded-md bg-white p-1.5"><Lines rows={1} /></div>
          </div>
        </Phone>
      );
    case 'ios-add':
      return (
        <Phone>
          <div className="flex h-8 items-center justify-between border-b border-slate-200 bg-slate-100 px-2">
            <span className="text-sky-600">✕</span>
            <Hot><span className="font-semibold text-sky-600">{t('app.ui_add')}</span></Hot>
          </div>
          <div className="flex items-center gap-2 p-3">
            <AppIcon size={30} />
            <div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">Liftbase</p><Lines rows={1} /></div>
          </div>
        </Phone>
      );
    case 'home-icon':
      return (
        <Phone>
          <div className="grid h-full grid-cols-3 content-start gap-x-2 gap-y-3 bg-gradient-to-b from-slate-200 to-slate-300 p-3">
            {Array.from({ length: 7 }).map((_, i) => <span key={i} className="mx-auto h-7 w-7 rounded-[22%] bg-white/70" />)}
            <span className="flex flex-col items-center gap-0.5">
              <Hot><AppIcon size={28} /></Hot>
              <span className="mt-1 font-medium text-slate-800">Liftbase</span>
            </span>
          </div>
        </Phone>
      );
    case 'android-dots':
      return (
        <Phone>
          {urlBar(<Hot><MoreVertical className="h-3.5 w-3.5 text-slate-700" /></Hot>)}
          <div className="p-2"><Lines rows={5} /></div>
        </Phone>
      );
    case 'android-menu':
      return (
        <Phone>
          {urlBar(<MoreVertical className="h-3.5 w-3.5 text-slate-700" />)}
          <div className="p-2"><Lines rows={4} /></div>
          <div className="absolute right-1 top-6 w-[112px] space-y-1.5 rounded-md bg-white p-2 shadow-lg ring-1 ring-black/5">
            <Lines rows={2} />
            <Hot className="w-full">
              <span className="flex w-full items-center gap-1 font-medium text-slate-800"><Download className="h-3 w-3 shrink-0" />{t('app.ui_install_app')}</span>
            </Hot>
            <Lines rows={2} />
          </div>
        </Phone>
      );
    case 'install-dialog':
      return (
        <Phone>
          <div className="absolute inset-0 bg-slate-900/30" />
          <div className="absolute inset-x-2 top-1/3 rounded-lg bg-white p-2.5 shadow-lg">
            <div className="flex items-center gap-2"><AppIcon size={22} /><p className="font-semibold text-slate-800">Liftbase</p></div>
            <div className="mt-2.5 flex items-center justify-end gap-2">
              <span className="h-3 w-8 rounded bg-slate-200" />
              <Hot><span className="rounded bg-sky-600 px-1.5 py-0.5 font-semibold text-white">{t('app.ui_install')}</span></Hot>
            </div>
          </div>
        </Phone>
      );
    case 'desk-address':
      return <Desk address={<Hot><MonitorDown className="h-3 w-3 text-slate-700" /></Hot>}><Lines rows={5} /></Desk>;
    case 'desk-edge':
      return <Desk address={<Hot><AppWindow className="h-3 w-3 text-slate-700" /></Hot>}><Lines rows={5} /></Desk>;
    case 'ff-note':
      return <Desk address={<Hot><Star className="h-3 w-3 text-slate-700" /></Hot>}><Lines rows={5} /></Desk>;
    case 'desk-dialog':
      return (
        <Desk address={<MonitorDown className="h-3 w-3 text-slate-700" />}>
          <Lines rows={4} />
          <div className="absolute right-3 top-9 w-[170px] rounded-md bg-white p-2.5 shadow-lg ring-1 ring-black/10">
            <div className="flex items-center gap-2"><AppIcon size={20} /><p className="font-semibold text-slate-800">Liftbase</p></div>
            <div className="mt-2.5 flex justify-end gap-2">
              <span className="h-4 w-12 rounded bg-slate-200" />
              <Hot><span className="rounded bg-sky-600 px-2 py-0.5 font-semibold text-white">{t('app.ui_install')}</span></Hot>
            </div>
          </div>
        </Desk>
      );
    case 'safari-file':
    case 'safari-dock': {
      const menuBar = (
        <div className="relative mb-1 flex h-5 items-center gap-3 rounded bg-slate-200/80 px-2 text-slate-700">
          <span className="font-semibold">Safari</span>
          {scene === 'safari-file' ? <Hot><span>{t('app.ui_file')}</span></Hot> : <span className="rounded bg-sky-600 px-1 text-white">{t('app.ui_file')}</span>}
          <span className="h-1.5 w-8 rounded-full bg-slate-300" /><span className="h-1.5 w-8 rounded-full bg-slate-300" />
          {scene === 'safari-dock' && (
            <div className="absolute left-12 top-5 z-10 w-[150px] space-y-1.5 rounded-md bg-white p-2 shadow-lg ring-1 ring-black/10">
              <Lines rows={3} />
              <Hot className="w-full"><span className="w-full font-medium text-slate-800">{t('app.ui_add_dock')}</span></Hot>
              <Lines rows={1} />
            </div>
          )}
        </div>
      );
      return <Desk menuBar={menuBar}><Lines rows={5} /></Desk>;
    }
    case 'notify-button': {
      const body = (
        <div className="space-y-2">
          <Lines rows={2} />
          <Hot><span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-1 font-semibold text-white"><Bell className="h-3 w-3" />{t('app.part_notify')}</span></Hot>
        </div>
      );
      return phone ? <Phone><div className="p-2.5 pt-6">{body}</div></Phone> : <Desk>{body}</Desk>;
    }
    case 'notify-prompt': {
      const prompt = (
        <div className={`rounded-md bg-white p-2.5 shadow-lg ring-1 ring-black/10 ${phone ? 'absolute inset-x-2 top-1/3 text-center' : 'absolute left-3 top-9 w-[200px]'}`}>
          <p className="leading-snug text-slate-800"><span className="font-semibold">{phone ? '„Liftbase“' : 'dashboard-liftpictures.com'}</span> {t('app.ui_wants')}</p>
          <div className={`mt-2.5 flex gap-2 ${phone ? 'justify-center' : 'justify-end'}`}>
            <span className="rounded border border-slate-300 px-2 py-0.5 text-slate-500">{t('app.ui_block')}</span>
            <Hot><span className="rounded bg-sky-600 px-2 py-0.5 font-semibold text-white">{t('app.ui_allow')}</span></Hot>
          </div>
        </div>
      );
      return phone ? <Phone><div className="absolute inset-0 bg-slate-900/30" />{prompt}</Phone> : <Desk><Lines rows={4} />{prompt}</Desk>;
    }
  }
}

export default function AppSetupGuide({ onDone }: { onDone?: () => void }) {
  const { t } = useI18n();
  const { parkId } = usePark();
  const { markDone } = useOnboarding();
  const detected = useMemo(detectDevice, []);
  const [device, setDevice] = useState<Device>(() => {
    try {
      const saved = localStorage.getItem(DEVICE_KEY) as Device | null;
      return saved && saved in BROWSERS ? saved : detected.device;
    } catch {
      return detected.device;
    }
  });
  const [browser, setBrowser] = useState<Browser>(detected.browser);
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);
  const [installable, setInstallable] = useState(canPromptInstall());
  const [installed, setInstalled] = useState(isStandalone());
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const steps = useMemo(() => stepsFor(device, browser), [device, browser]);
  const step = steps[Math.min(index, steps.length - 1)];
  const onThisDevice = device === detected.device;

  useEffect(() => onInstallPromptChange(() => setInstallable(canPromptInstall())), []);
  useEffect(() => {
    void getCurrentOperatorPushSubscription().then((sub) => setPushOn(!!sub && Notification.permission === 'granted')).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (pushOn || installed) markDone('app');
  }, [pushOn, installed, markDone]);

  // Die Skizze läuft von selbst durch, bis der Nutzer selbst weiterklickt.
  useEffect(() => {
    if (!auto || index >= steps.length - 1) return;
    const timer = window.setTimeout(() => setIndex((i) => Math.min(steps.length - 1, i + 1)), 4500);
    return () => window.clearTimeout(timer);
  }, [auto, index, steps.length]);

  function chooseDevice(next: Device) {
    setDevice(next);
    setBrowser(next === detected.device ? detected.browser : BROWSERS[next][0]);
    setIndex(0);
    setAuto(true);
    try {
      localStorage.setItem(DEVICE_KEY, next);
    } catch {
      // nur für diese Sitzung
    }
  }
  const go = (next: number) => { setAuto(false); setIndex(Math.max(0, Math.min(steps.length - 1, next))); };

  async function install() {
    if (await promptInstall()) setInstalled(true);
  }
  async function enablePush() {
    if (!parkId) return;
    setPushBusy(true);
    setPushError(null);
    try {
      await subscribeOperatorPush(parkId);
      setPushOn(true);
    } catch (e) {
      setPushError(e instanceof Error ? e.message : String(e));
    } finally {
      setPushBusy(false);
    }
  }

  const devices: { key: Device; icon: typeof Laptop }[] = [
    { key: 'iphone', icon: Smartphone }, { key: 'android', icon: Smartphone }, { key: 'mac', icon: Laptop }, { key: 'windows', icon: Laptop },
  ];
  const chip = (active: boolean) =>
    `inline-flex min-h-[40px] items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
      active ? 'border-[color:var(--ink)] bg-[color:var(--ink)] text-white' : 'border-[color:var(--line-strong)] bg-white text-[color:var(--ink-2)] hover:bg-slate-50'
    }`;
  const hintKey = `app.hint_${device === 'iphone' ? 'ios' : device}`;

  return (
    <div>
      <p className="text-sm font-semibold text-[color:var(--ink)]">{t('app.q_device')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {devices.map(({ key, icon: Icon }) => (
          <button key={key} type="button" onClick={() => chooseDevice(key)} aria-pressed={device === key} className={chip(device === key)}>
            <Icon className="h-4 w-4" />
            {t(`app.dev_${key}`)}
            {key === detected.device && <span className={`text-[11px] ${device === key ? 'text-white/70' : 'text-[color:var(--ink-3)]'}`}>· {t('app.detected')}</span>}
          </button>
        ))}
      </div>
      {BROWSERS[device].length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-[color:var(--ink-3)]">{t('app.q_browser')}</span>
          {BROWSERS[device].map((b) => (
            <button key={b} type="button" onClick={() => { setBrowser(b); setIndex(0); setAuto(true); }} aria-pressed={browser === b}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${browser === b ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700' : 'border-[color:var(--line-strong)] text-[color:var(--ink-2)] hover:bg-slate-50'}`}>
              {BROWSER_LABEL[b]}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:items-center">
        <div className="flex min-h-[284px] items-center justify-center rounded-xl bg-slate-50 p-4">
          <div key={`${device}-${browser}-${index}`} className="lp-scene-in w-full">
            <SceneView scene={step.scene} device={device} />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-brand-700">
            {step.part === 'install' ? `1 · ${t('app.part_install')}` : `2 · ${t('app.part_notify')}`}
          </p>
          <p className="mt-0.5 text-xs text-[color:var(--ink-3)]">{t('app.step', { index: index + 1, total: steps.length })}</p>
          <p className="mt-2 text-base leading-relaxed text-[color:var(--ink)]">{t(step.textKey)}</p>
          {step.part === 'notify' && <p className="mt-2 text-xs leading-relaxed text-[color:var(--ink-3)]">{t(hintKey)}</p>}

          <div className="mt-4 space-y-2">
            {step.part === 'install' && installed && onThisDevice && (
              <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {t('app.installed')}</p>
            )}
            {step.part === 'install' && installable && !installed && onThisDevice && (
              <button type="button" onClick={() => void install()} className="glass-button-primary">
                <Download className="h-4 w-4" /> {t('app.install_now')}
              </button>
            )}
            {step.part === 'notify' && onThisDevice && (
              pushOn ? (
                <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {t('app.push_on')}</p>
              ) : isOperatorPushSupported() ? (
                <button type="button" onClick={() => void enablePush()} disabled={pushBusy} className="glass-button-primary disabled:opacity-60">
                  <Bell className="h-4 w-4" /> {t('app.enable_push')}
                </button>
              ) : (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{t('app.push_unsupported')}</p>
              )
            )}
            {pushError && <p className="text-xs text-rose-700">{t('app.push_failed', { error: pushError })}</p>}
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="glass-button-secondary disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" /> {t('app.back')}
            </button>
            {index < steps.length - 1 ? (
              <button type="button" onClick={() => go(index + 1)} className="glass-button-secondary">
                {t('app.next')} <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={() => { setIndex(0); setAuto(true); }} className="glass-button-secondary">
                <RotateCcw className="h-4 w-4" /> {t('app.replay')}
              </button>
            )}
            {onDone && index === steps.length - 1 && (
              <button type="button" onClick={onDone} className="glass-button-primary ml-auto">{t('app.next')}</button>
            )}
          </div>
          <div className="mt-3 flex gap-1.5" aria-hidden>
            {steps.map((s, i) => (
              <button key={i} type="button" tabIndex={-1} onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-brand-600' : s.part === 'notify' ? 'w-3 bg-slate-300' : 'w-3 bg-slate-200'}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
