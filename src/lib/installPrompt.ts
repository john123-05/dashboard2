// „Als App installieren“: Chrome, Edge und Android melden mit `beforeinstallprompt`, dass die Seite installierbar ist.
// Das Ereignis kommt kurz nach dem Laden und nur einmal – deshalb hier früh auffangen und für die Anleitung aufheben.

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

/** Öffnet den Installieren-Dialog des Browsers. `true`, wenn der Nutzer installiert hat. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  await event.prompt();
  const choice = await event.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
  listeners.forEach((fn) => fn());
  return choice.outcome === 'accepted';
}

export function onInstallPromptChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Läuft die Seite gerade als installierte App (eigenes Fenster / vom Startbildschirm)? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type Device = 'iphone' | 'android' | 'mac' | 'windows';
export type Browser = 'safari' | 'chrome' | 'edge' | 'firefox';

export const BROWSERS: Record<Device, Browser[]> = {
  iphone: ['safari', 'chrome'],
  android: ['chrome'],
  mac: ['chrome', 'safari', 'edge', 'firefox'],
  windows: ['chrome', 'edge', 'firefox'],
};

export function detectDevice(): { device: Device; browser: Browser } {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
  const device: Device = /iPhone|iPad|iPod/.test(ua) || touchMac ? 'iphone' : /Android/.test(ua) ? 'android' : /Windows/.test(ua) ? 'windows' : 'mac';
  const raw: Browser = /Edg\//.test(ua) ? 'edge' : /Firefox|FxiOS/.test(ua) ? 'firefox' : /CriOS|Chrome/.test(ua) ? 'chrome' : 'safari';
  const browser = BROWSERS[device].includes(raw) ? raw : BROWSERS[device][0];
  return { device, browser };
}
