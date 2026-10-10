// Erste Schritte / Einrichtungsassistent (HubSpot-Stil „Setup guide“): jede Seite des Dashboards mit dem, was man
// dort tun kann, als abhakbare Liste. Texte stehen in i18n unter `ob.<id>.title|purpose|can1..3`.
// Stand je Nutzer und Park im Browser (localStorage); Seitenbesuche haken automatisch ab.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Aperture, BookOpen, ClipboardList, DollarSign, Gauge, LayoutDashboard, LifeBuoy, Mail, Package, Send,
  Settings, Share2, ShoppingCart, Sparkles, Store, Tags, Target, UserCog, Users, Wand2, Camera,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePark } from '../contexts/ParkContext';
import { hasGuestActivity } from '../components/GuestActivityAwareOverlay';
import { canSee, pageKeyForPath } from './permissions';
import { featureForPath, useEntitlements } from './plans';

export type GuideItem = {
  id: string;
  path: string;
  icon: LucideIcon;
  /** Ungefähre Dauer in Minuten (Seite ansehen). */
  minutes: number;
  /** Nur sichtbar, wenn die Kamera-Steuerung für den Park verfügbar ist. */
  needsCamera?: boolean;
  /** Kein Seitenbesuch, sondern eine Aktion (Rundgang). */
  action?: 'tour';
};
export type GuideSection = { id: string; titleKey: string; subKey: string; items: GuideItem[] };

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'start', titleKey: 'ob.section_start', subKey: 'ob.section_start_sub',
    items: [{ id: 'tour', path: '/start', icon: Sparkles, minutes: 2, action: 'tour' }],
  },
  {
    id: 'park', titleKey: 'ob.section_park', subKey: 'ob.section_park_sub',
    items: [
      { id: 'overview', path: '/', icon: LayoutDashboard, minutes: 1 },
      { id: 'revenue', path: '/revenue', icon: DollarSign, minutes: 1 },
      { id: 'purchases', path: '/purchases', icon: ShoppingCart, minutes: 1 },
      { id: 'photos', path: '/photos', icon: Camera, minutes: 1 },
    ],
  },
  {
    id: 'machine', titleKey: 'ob.section_machine', subKey: 'ob.section_machine_sub',
    items: [
      { id: 'health', path: '/health', icon: Activity, minutes: 1 },
      { id: 'kamera', path: '/kamera', icon: Aperture, minutes: 2, needsCamera: true },
      { id: 'personalization', path: '/personalization', icon: Wand2, minutes: 3 },
      { id: 'configuration', path: '/configuration', icon: Package, minutes: 1 },
    ],
  },
  {
    id: 'growth', titleKey: 'ob.section_growth', subKey: 'ob.section_growth_sub',
    items: [
      { id: 'leads', path: '/leads', icon: Mail, minutes: 2 },
      { id: 'contacts', path: '/leads/kontakte', icon: Users, minutes: 1 },
      { id: 'email', path: '/leads/email', icon: Send, minutes: 3 },
      { id: 'social', path: '/leads/social', icon: Share2, minutes: 2 },
      { id: 'survey', path: '/leads/umfrage', icon: ClipboardList, minutes: 2 },
      { id: 'tracking', path: '/leads/pixel', icon: Target, minutes: 2 },
      { id: 'shop', path: '/shop', icon: Store, minutes: 2 },
      { id: 'speed', path: '/users', icon: Gauge, minutes: 2 },
    ],
  },
  {
    id: 'team', titleKey: 'ob.section_team', subKey: 'ob.section_team_sub',
    items: [
      { id: 'team', path: '/team', icon: UserCog, minutes: 2 },
      { id: 'settings', path: '/settings', icon: Settings, minutes: 3 },
      { id: 'plans', path: '/plaene', icon: Tags, minutes: 2 },
      { id: 'tickets', path: '/tickets', icon: LifeBuoy, minutes: 1 },
      { id: 'ratgeber', path: '/ratgeber', icon: BookOpen, minutes: 2 },
    ],
  },
];

type Stored = { done: string[]; hidden: boolean };
const EVENT = 'lp:onboarding-changed';

function storageKey(userId: string | undefined, parkId: string | null | undefined) {
  return `lp-onboarding:${userId ?? 'anon'}:${parkId ?? 'none'}`;
}
function read(key: string): Stored {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null');
    return { done: Array.isArray(parsed?.done) ? parsed.done.filter((x: unknown) => typeof x === 'string') : [], hidden: parsed?.hidden === true };
  } catch {
    return { done: [], hidden: false };
  }
}
function write(key: string, value: Stored) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ohne Speicher (privates Fenster) bleibt es bei der Ansicht – nichts geht kaputt.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Der Rundgang besucht Seiten, ohne sie abzuhaken. */
let suppressTracking = false;
export function setOnboardingTrackingSuppressed(value: boolean) {
  suppressTracking = value;
}

export type VisibleGuideItem = GuideItem & { locked: boolean; done: boolean };

export function useOnboarding() {
  const { user, isOwner, isStaff, allowedPages } = useAuth();
  const { parkId, cameraControlAvailable } = usePark();
  const { has } = useEntitlements();
  const key = storageKey(user?.id, parkId);
  const [stored, setStored] = useState<Stored>(() => read(key));

  useEffect(() => {
    setStored(read(key));
    const sync = () => setStored(read(key));
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [key]);

  const sections = useMemo(() => {
    const viewer = { isOwner, isStaff, allowedPages };
    return GUIDE_SECTIONS.map((section) => ({
      ...section,
      items: section.items
        .filter((item) => (item.needsCamera ? cameraControlAvailable === true : true))
        .filter((item) => item.action || canSee(pageKeyForPath(item.path), viewer))
        .map((item): VisibleGuideItem => {
          const feature = featureForPath(item.path);
          const locked = !!feature && !has(feature) && !(feature === 'speed' && hasGuestActivity(parkId));
          return { ...item, locked, done: stored.done.includes(item.id) };
        }),
    })).filter((section) => section.items.length > 0);
  }, [allowedPages, cameraControlAvailable, has, isOwner, isStaff, parkId, stored.done]);

  const items = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const next = items.find((i) => !i.done) ?? null;

  const markDone = useCallback((id: string) => {
    const current = read(key);
    if (!current.done.includes(id)) write(key, { ...current, done: [...current.done, id] });
  }, [key]);
  const toggle = useCallback((id: string) => {
    const current = read(key);
    write(key, { ...current, done: current.done.includes(id) ? current.done.filter((x) => x !== id) : [...current.done, id] });
  }, [key]);
  const setHidden = useCallback((hidden: boolean) => write(key, { ...read(key), hidden }), [key]);
  const reset = useCallback(() => write(key, { done: [], hidden: false }), [key]);

  return {
    sections, items, doneCount, total, next, hidden: stored.hidden,
    percent: total ? Math.round((doneCount / total) * 100) : 0,
    complete: total > 0 && doneCount >= total,
    markDone, toggle, setHidden, reset,
  };
}

/** Haken setzen, sobald der Nutzer eine Seite der Liste besucht (außer im Rundgang). */
export function useOnboardingTracker(pathname: string) {
  const { items, markDone } = useOnboarding();
  useEffect(() => {
    if (suppressTracking) return;
    const hit = items.find((item) => !item.action && !item.done && (pathname === item.path || (item.path !== '/' && item.path !== '/leads' && pathname.startsWith(`${item.path}/`))));
    if (hit) markDone(hit.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
}
