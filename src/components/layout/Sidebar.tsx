import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  DollarSign,
  ShoppingCart,
  Users,
  Camera,
  Mail,
  Wand2,
  LifeBuoy,
  Activity,
  Settings,
  LogOut,
  ChevronDown,
  ArrowUpCircle,
  ChevronRight,
  UserCog,
  Package,
  Store,
  X,
  Sun,
  Moon,
  MoreHorizontal,
  Pin,
  PinOff,
  GripVertical,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../lib/i18n';
import { usePark } from '../../contexts/ParkContext';
import { supabase } from '../../lib/supabase';
import ProfileParkSwitcher from './ProfileParkSwitcher';
import { CRM_TABS } from '../../lib/crmTabs';
import { featureForPath, useEntitlements, PLAN_LABEL_KEY } from '../../lib/plans';

type NavItem = {
  to: string;
  icon: typeof LayoutDashboard;
  labelKey: string;
  comingSoon?: boolean;
  kioskUnlocks?: boolean;
  guestActivityUnlocks?: boolean;
  // Shows a permanent "(Upgrade)" hint: the page is a demo until the park books it.
  upgrade?: boolean;
  // Visible to the restricted "staff" role. Everything else is owner-only.
  staffAllowed?: boolean;
  ownerOnly?: boolean;
  /** Unterseiten, die sich unter dem Eintrag aufklappen lassen. */
  children?: { to: string; labelKey: string }[];
  /** Gruppe in der Navigation (docs/PRODUKT_PLAN.md, B3). */
  group: NavGroup;
};

type NavGroup = 'betrieb' | 'marketing' | 'verwaltung';

// Reihenfolge und Überschriften der Gruppen. „Betrieb“ ist der kostenlose
// Basis-Plan, „Marketing“ die bezahlten Pläne und Add-ons.
const NAV_GROUPS: { key: NavGroup; labelKey: string }[] = [
  { key: 'betrieb', labelKey: 'nav.group_operations' },
  { key: 'marketing', labelKey: 'nav.group_marketing' },
  { key: 'verwaltung', labelKey: 'nav.group_admin' },
];

const navItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, labelKey: 'nav.overview', comingSoon: true, kioskUnlocks: true, group: 'betrieb' },
  { to: '/revenue', icon: DollarSign, labelKey: 'nav.revenue', comingSoon: true, kioskUnlocks: true, group: 'betrieb' },
  { to: '/purchases', icon: ShoppingCart, labelKey: 'nav.purchases', comingSoon: true, kioskUnlocks: true, group: 'betrieb' },
  { to: '/users', icon: Users, labelKey: 'nav.speed', comingSoon: true, guestActivityUnlocks: true, group: 'marketing' },
  { to: '/photos', icon: Camera, labelKey: 'nav.photos', staffAllowed: true, group: 'betrieb' },
  {
    to: '/leads',
    icon: Mail,
    labelKey: 'nav.leads',
    // Die CRM-Reiter sind eigene Seiten (CRM_TABS in survey/UnlockCenter.tsx).
    children: CRM_TABS.filter((tab) => tab.key !== 'overview').map((tab) => ({ to: tab.path, labelKey: tab.labelKey })),
    group: 'marketing',
  },
  { to: '/personalization', icon: Wand2, labelKey: 'nav.personalization', staffAllowed: true, group: 'betrieb' },
  { to: '/tickets', icon: LifeBuoy, labelKey: 'nav.support', staffAllowed: true, group: 'verwaltung' },
  { to: '/health', icon: Activity, labelKey: 'nav.system_health', staffAllowed: true, group: 'betrieb' },
  { to: '/kamera', icon: Camera, labelKey: 'nav.camera', staffAllowed: true, group: 'betrieb' },
  { to: '/configuration', icon: Package, labelKey: 'nav.configuration', group: 'verwaltung' },
  { to: '/shop', icon: Store, labelKey: 'nav.shop', upgrade: true, group: 'marketing' },
  { to: '/team', icon: UserCog, labelKey: 'nav.team', ownerOnly: true, group: 'verwaltung' },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings', group: 'verwaltung' },
];

// Same breakpoint as the mobile drawer in index.css. There the sidebar is a
// full-width drawer, so "Mehr" opens inline instead of as a flyout.
const MOBILE_QUERY = '(max-width: 900px)';

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

// Dark label bubble to the right of the hovered element. Rendered in a portal
// so the scrolling nav and the fixed sidebar never clip it.
type Tip = { label: string; top: number; left: number };

function tipFor(el: HTMLElement, label: string): Tip {
  const r = el.getBoundingClientRect();
  return { label, top: r.top + r.height / 2, left: r.right + 10 };
}

// Panel that opens to the right of an anchor (the "Mehr" flyout and the
// per-row options menu). Closes on outside click, Escape and scroll of the nav.
function Flyout({
  anchor,
  onClose,
  children,
  width = 240,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const sidebar = anchor.closest('aside')?.getBoundingClientRect();
    const left = (sidebar?.right ?? r.right) + 8;
    const height = panelRef.current?.offsetHeight ?? 0;
    const top = Math.max(8, Math.min(r.top - 6, window.innerHeight - height - 8));
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
      className="operator-portal fixed z-[300] rounded-lg border border-black/10 bg-white p-1.5 text-slate-700 shadow-[0_12px_32px_rgba(16,24,40,0.18)] animate-fade-in"
    >
      {children}
    </div>,
    document.body,
  );
}

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const { profile, currentOrg, signOut, isStaff, isOwner, refreshProfile } = useAuth();
  const location = useLocation();
  const { t } = useI18n();
  const { parkName, setPark, isKioskPark, parkId, cameraControlAvailable } = usePark();
  const isMobile = useIsMobile();
  const entitlements = useEntitlements();
  // Light/dark switch: tags <html data-operator-theme>, the dark styles live in
  // src/styles/operator-dark.css. index.html sets the attribute before the first
  // paint so a reload in dark mode doesn't flash white.
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('lp-operator-theme') === 'dark' ? 'dark' : 'light'),
  );
  useEffect(() => {
    document.documentElement.setAttribute('data-operator-theme', theme);
    localStorage.setItem('lp-operator-theme', theme);
  }, [theme]);
  // Same park-gate as GuestActivityAwareOverlay: the Benutzer page only has
  // real content for CSS-ALPINE/Tarzans and Plose so far.
  const isTarzansPark =
    parkId === 'e2da6436-6a83-4c39-add3-5f99eb6bd897' || parkId === '3b08e092-beb5-46ec-9811-5698e86dd83a' ||
    parkId === '25c1022b-4e2e-4fc4-b54d-72a4ced2522b';
  const showFull = !collapsed || mobileOpen;

  const visibleItemsDefaultOrder = navItems.filter((item) => {
    if (item.to === '/kamera' && cameraControlAvailable !== true) return false;
    if (isStaff) return item.staffAllowed;
    if (item.ownerOnly) return isOwner;
    return true;
  });

  // Order and "Mehr" split are saved per account (operator_profiles), so they
  // follow the user to another browser. While a save + refreshProfile is in
  // flight the local override is shown, so a dropped item doesn't jump back.
  const savedOrder = profile?.nav_item_order ?? [];
  const savedUnpinned = profile?.nav_unpinned_items ?? [];
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null);
  const [unpinnedOverride, setUnpinnedOverride] = useState<string[] | null>(null);
  const savedOrderKey = savedOrder.join('|');
  const savedUnpinnedKey = savedUnpinned.join('|');
  useEffect(() => setOrderOverride(null), [savedOrderKey]);
  useEffect(() => setUnpinnedOverride(null), [savedUnpinnedKey]);

  // Items not in the custom order yet (nothing reordered so far, or a nav item
  // added after the user last reordered) keep their default relative position,
  // appended after the known ones.
  const itemOrder = orderOverride ?? savedOrder;
  const visibleItems = [...visibleItemsDefaultOrder].sort((a, b) => {
    const ai = itemOrder.indexOf(a.to);
    const bi = itemOrder.indexOf(b.to);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const unpinnedIds = unpinnedOverride ?? savedUnpinned;
  // Innerhalb einer Gruppe gilt die eigene Reihenfolge (Drag & Drop), die
  // Gruppen selbst stehen fest. Ein in eine andere Gruppe gezogener Eintrag
  // springt so in seine Gruppe zurück.
  const groupIndex = (item: NavItem) => NAV_GROUPS.findIndex((g) => g.key === item.group);
  const pinnedItems = visibleItems
    .filter((item) => !unpinnedIds.includes(item.to))
    .map((item, i) => ({ item, i }))
    .sort((a, b) => groupIndex(a.item) - groupIndex(b.item) || a.i - b.i)
    .map(({ item }) => item);
  const unpinnedItems = visibleItems.filter((item) => unpinnedIds.includes(item.to));

  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [moreInlineOpen, setMoreInlineOpen] = useState(false);
  const [menu, setMenu] = useState<{ to: string; anchor: HTMLElement } | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  // Route change: close every popup (the user picked something).
  useEffect(() => {
    setMoreAnchor(null);
    setMenu(null);
    setTip(null);
  }, [location.pathname]);

  async function setUnpinned(next: string[]) {
    setMenu(null);
    if (!profile) return;
    setUnpinnedOverride(next);
    const { error } = await supabase.from('operator_profiles').update({ nav_unpinned_items: next }).eq('id', profile.id);
    if (error) setUnpinnedOverride(null);
    await refreshProfile();
  }

  function unpinItem(to: string) {
    if (!unpinnedIds.includes(to)) void setUnpinned([...unpinnedIds, to]);
  }

  function pinItem(to: string) {
    void setUnpinned(unpinnedIds.filter((id) => id !== to));
  }

  async function persistOrder(nextPinnedOrder: string[]) {
    if (!profile) return;
    // Keep unpinned items' relative order at the end, untouched.
    const fullOrder = [...nextPinnedOrder, ...unpinnedItems.map((i) => i.to)];
    setOrderOverride(fullOrder);
    const { error } = await supabase.from('operator_profiles').update({ nav_item_order: fullOrder }).eq('id', profile.id);
    if (error) setOrderOverride(null);
    await refreshProfile();
  }

  // Reorder by dragging the grip (pointer events: mouse, pen and touch alike).
  // `insertAt` is the gap the item would land in, 0..pinnedItems.length.
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [drag, setDrag] = useState<{ to: string; insertAt: number } | null>(null);

  function gapForPointer(clientY: number) {
    let gap = 0;
    pinnedItems.forEach((item) => {
      const el = rowRefs.current.get(item.to);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (clientY > r.top + r.height / 2) gap += 1;
    });
    return gap;
  }

  function finishDrag() {
    if (!drag) return;
    const order = pinnedItems.map((i) => i.to);
    const from = order.indexOf(drag.to);
    let to = drag.insertAt;
    setDrag(null);
    if (from === -1) return;
    if (to > from) to -= 1;
    if (to === from) return;
    order.splice(from, 1);
    order.splice(to, 0, drag.to);
    void persistOrder(order);
  }

  function badgeFor(item: NavItem) {
    const showComingSoon =
      item.comingSoon &&
      !(item.kioskUnlocks && isKioskPark) &&
      !(item.guestActivityUnlocks && isTarzansPark);
    return showComingSoon
      ? item.guestActivityUnlocks
        ? t('nav.upgrade')
        : t('nav.coming_soon')
      : item.upgrade
        ? t('nav.upgrade')
        : null;
  }

  function isActivePath(to: string) {
    return to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
  }

  /** Genau diese Seite - nicht eine ihrer Unterseiten. */
  function isExactPath(to: string) {
    return location.pathname === to;
  }

  // Aufgeklappte Einträge mit Unterseiten. Standard: zu; wer auf einer
  // Unterseite ist, sieht sie offen. Die Wahl bleibt in diesem Browser.
  const [expanded, setExpanded] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('lp-nav-expanded');
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  function toggleExpanded(to: string) {
    setExpanded((prev) => {
      const next = prev.includes(to) ? prev.filter((x) => x !== to) : [...prev, to];
      try {
        localStorage.setItem('lp-nav-expanded', JSON.stringify(next));
      } catch {
        // Speicher gesperrt - gilt dann nur für diese Sitzung
      }
      return next;
    });
  }

  function dropLine() {
    return (
      <div className="relative h-0" aria-hidden>
        <div className="absolute inset-x-2 -top-px h-0.5 rounded-full bg-brand-500" />
      </div>
    );
  }

  function renderNavRow(item: NavItem, index: number) {
    const hasChildren = showFull && !!item.children?.length;
    const childActive = Boolean(item.children?.some((c) => isExactPath(c.to)));
    const open = hasChildren && (expanded.includes(item.to) || childActive);
    // Mit aufgeklappten Unterseiten markiert der Haupteintrag nur noch seine
    // eigene Seite - sonst wären zwei Zeilen gleichzeitig hervorgehoben.
    const isActive = hasChildren ? isExactPath(item.to) : isActivePath(item.to);
    // Plan-Funktion ohne Freischaltung: Upgrade-Symbol. Add-ons (Online-Shop,
    // Speedmessung) behalten ihr „(Upgrade)“ - so wollte John es.
    const feature = featureForPath(item.to);
    const required = feature ? entitlements.requiredPlan(feature) : null;
    const lockedPlan = !entitlements.loading && !entitlements.error && feature && required && required !== 'addon' && !entitlements.has(feature) ? required : null;
    const badge = badgeFor(item);
    const label = t(item.labelKey);
    const canDrag = showFull && pinnedItems.length > 1;
    const menuOpen = menu?.to === item.to;

    return (
      <div key={item.to}>
        {drag && drag.insertAt === index && dropLine()}
        <div
          ref={(el) => {
            if (el) rowRefs.current.set(item.to, el);
            else rowRefs.current.delete(item.to);
          }}
          className={`group/row relative flex items-center ${drag?.to === item.to ? 'opacity-40' : ''}`}
        >
          {canDrag && (
            <span
              role="button"
              tabIndex={-1}
              aria-hidden
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                setMenu(null);
                setDrag({ to: item.to, insertAt: index });
              }}
              onPointerMove={(event) => {
                if (!drag) return;
                const gap = gapForPointer(event.clientY);
                if (gap !== drag.insertAt) setDrag({ ...drag, insertAt: gap });
              }}
              onPointerUp={finishDrag}
              onPointerCancel={() => setDrag(null)}
              style={{ touchAction: 'none' }}
              className={`absolute left-0 top-1/2 z-10 flex h-7 w-4 -translate-y-1/2 cursor-grab items-center justify-center rounded text-slate-500 transition-opacity hover:text-slate-200 active:cursor-grabbing ${
                drag?.to === item.to ? 'opacity-100' : isMobile ? 'opacity-60' : 'opacity-0 group-hover/row:opacity-100'
              }`}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
          )}

          <NavLink
            to={item.to}
            draggable={false}
            onMouseEnter={(event) => !showFull && setTip(tipFor(event.currentTarget, badge ? `${label} (${badge})` : label))}
            onMouseLeave={() => setTip(null)}
            onFocus={(event) => !showFull && setTip(tipFor(event.currentTarget, label))}
            onBlur={() => setTip(null)}
            aria-label={showFull ? undefined : label}
            className={`group relative flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
              isActive
                ? 'bg-white/[0.1] font-medium text-white'
                : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
            } ${showFull ? (hasChildren ? 'pr-14' : 'pr-8') : 'justify-center'}`}
          >
            {isActive && (
              <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand-500" aria-hidden />
            )}
            <item.icon
              className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
              }`}
            />
            {showFull && (
              <span className="truncate">
                {label}
                {badge && <span className="ml-1 text-xs text-slate-500">({badge})</span>}
              </span>
            )}
            {showFull && lockedPlan && (
              <span title={t('plans.included_in', { plan: t(PLAN_LABEL_KEY[lockedPlan]) })} className="ml-auto shrink-0 text-brand-400">
                <ArrowUpCircle className="h-4 w-4" />
              </span>
            )}
          </NavLink>

          {hasChildren && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                toggleExpanded(item.to);
              }}
              aria-expanded={open}
              title={open ? t('nav.hide_pages') : t('nav.show_pages')}
              aria-label={open ? t('nav.hide_pages') : t('nav.show_pages')}
              className="absolute right-7 rounded p-1 text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
            </button>
          )}

          {showFull && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                setMenu(menuOpen ? null : { to: item.to, anchor: event.currentTarget });
              }}
              className={`absolute right-1 rounded p-1 text-slate-400 transition-opacity hover:bg-white/[0.08] hover:text-white ${
                menuOpen ? 'opacity-100' : isMobile ? 'opacity-60' : 'opacity-0 focus:opacity-100 group-hover/row:opacity-100'
              }`}
              title={t('nav.options')}
              aria-label={t('nav.options')}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
        </div>

        {open && (
          <div className="relative ml-[22px] mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
            {item.children?.map((child) => (
              <NavLink
                key={child.to}
                to={child.to}
                className={`block truncate rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                  isExactPath(child.to) ? 'bg-white/[0.1] font-medium text-white' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                {t(child.labelKey)}
              </NavLink>
            ))}
          </div>
        )}
        {drag && index === pinnedItems.length - 1 && drag.insertAt === pinnedItems.length && dropLine()}
      </div>
    );
  }

  // Rows inside the "Mehr" flyout (light panel): navigate on click, pin icon
  // on the right brings the item back into the main list.
  function renderMoreRow(item: NavItem) {
    const isActive = isActivePath(item.to);
    const badge = badgeFor(item);
    return (
      <div key={item.to} className="group/more flex items-center rounded-md hover:bg-slate-100">
        <NavLink
          to={item.to}
          onClick={() => {
            setMoreAnchor(null);
            onCloseMobile();
          }}
          className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm ${
            isActive ? 'font-medium text-brand-700' : 'text-slate-700'
          }`}
        >
          <item.icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-brand-600' : 'text-slate-500'}`} />
          <span className="truncate">
            {t(item.labelKey)}
            {badge && <span className="ml-1 text-xs text-slate-400">({badge})</span>}
          </span>
        </NavLink>
        <button
          type="button"
          onClick={() => pinItem(item.to)}
          className="mr-1 rounded p-1.5 text-slate-400 opacity-0 transition-opacity hover:bg-white hover:text-slate-700 focus:opacity-100 group-hover/more:opacity-100"
          title={t('nav.pin')}
          aria-label={t('nav.pin')}
        >
          <Pin className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const moreActive = unpinnedItems.some((item) => isActivePath(item.to));
  const useFlyout = !isMobile;

  // Bottom-row icon button: tooltip to the right, same look everywhere.
  function iconButton(label: string, onClick: () => void, icon: ReactNode, hoverClass = 'hover:text-white') {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={(event) => setTip(tipFor(event.currentTarget, label))}
        onMouseLeave={() => setTip(null)}
        onFocus={(event) => setTip(tipFor(event.currentTarget, label))}
        onBlur={() => setTip(null)}
        aria-label={label}
        className={`flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/[0.06] ${hoverClass}`}
      >
        {icon}
      </button>
    );
  }

  return (
    <aside
      className={`glass-sidebar fixed inset-y-0 left-0 z-30 flex flex-col transition-[width] duration-200 ${
        collapsed ? 'w-[72px]' : 'w-64'
      } ${mobileOpen ? 'mobile-open' : ''}`}
    >
      <div className="flex h-16 items-center gap-3 border-b border-white/[0.06] px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center">
          <img
            src="https://xcrxltiiovpoladpaewd.supabase.co/storage/v1/object/public/test/Liftpicutures%20Logo%20alt.jpg"
            alt="Liftpictures"
            className="h-9 w-9 rounded-lg object-cover"
            loading="lazy"
          />
        </div>
        {showFull && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-semibold tracking-tight text-white">Liftpictures</h1>
            <p className="truncate text-[11px] text-slate-400">
              {parkName || currentOrg?.name || t('nav.operator_dashboard')}
            </p>
          </div>
        )}
        <button
          type="button"
          className="mobile-nav-close"
          aria-label={t('nav.close')}
          onClick={onCloseMobile}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin" onScroll={() => setTip(null)}>
        <div className={`space-y-0.5 ${drag ? 'select-none' : ''}`}>
          {pinnedItems.map((item, index) => {
            const startsGroup = index === 0 || pinnedItems[index - 1].group !== item.group;
            const group = NAV_GROUPS.find((g) => g.key === item.group);
            return (
              <div key={item.to}>
                {startsGroup && group && (
                  showFull ? (
                    <p className={`px-3 pb-1 text-[11px] font-medium text-slate-500 ${index === 0 ? 'pt-0' : 'pt-4'}`}>
                      {t(group.labelKey)}
                    </p>
                  ) : (
                    index > 0 && <div className="mx-3 my-2 h-px bg-white/10" aria-hidden />
                  )
                )}
                {renderNavRow(item, index)}
              </div>
            );
          })}
        </div>

        {unpinnedItems.length > 0 && (
          <div className="mt-0.5">
            <button
              type="button"
              onClick={(event) => {
                if (useFlyout) {
                  const el = event.currentTarget;
                  setTip(null);
                  setMoreAnchor((open) => (open ? null : el));
                } else {
                  setMoreInlineOpen((open) => !open);
                }
              }}
              onMouseEnter={(event) => !showFull && !moreAnchor && setTip(tipFor(event.currentTarget, t('nav.more')))}
              onMouseLeave={() => setTip(null)}
              aria-expanded={useFlyout ? !!moreAnchor : moreInlineOpen}
              aria-label={t('nav.more')}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                moreAnchor || moreActive ? 'bg-white/[0.08] text-white' : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
              } ${showFull ? '' : 'justify-center'}`}
            >
              <MoreHorizontal className="h-[18px] w-[18px] shrink-0 text-slate-400" />
              {showFull && <span className="flex-1 text-left">{t('nav.more')}</span>}
              {showFull &&
                (useFlyout ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                ) : (
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${moreInlineOpen ? 'rotate-180' : ''}`} />
                ))}
            </button>

            {!useFlyout && moreInlineOpen && (
              <div className="mt-1 space-y-0.5 rounded-md bg-white p-1">
                {unpinnedItems.map((item) => renderMoreRow(item))}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        {showFull && <ProfileParkSwitcher onSwitched={onCloseMobile} />}

        <div className={`flex ${showFull ? 'items-center' : 'flex-col items-center'} gap-1`}>
          {showFull ? (
            <button
              onClick={async () => {
                setPark(null, null);
                await signOut();
              }}
              className="flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-rose-300"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>{t('nav.sign_out')}</span>
            </button>
          ) : (
            iconButton(
              t('nav.sign_out'),
              async () => {
                setPark(null, null);
                await signOut();
              },
              <LogOut className="h-4 w-4" />,
              'hover:text-rose-300',
            )
          )}

          {iconButton(
            theme === 'dark' ? t('nav.light_mode') : t('nav.dark_mode'),
            () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark')),
            theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />,
          )}

          <div className="mobile-nav-hide-collapse-btn">
            {iconButton(
              collapsed ? t('nav.expand_sidebar') : t('nav.collapse_sidebar'),
              () => {
                setTip(null);
                setMoreAnchor(null);
                setMenu(null);
                onToggleCollapsed();
              },
              collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />,
            )}
          </div>
        </div>
      </div>

      {moreAnchor && useFlyout && (
        <Flyout anchor={moreAnchor} onClose={() => setMoreAnchor(null)}>
          <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('nav.more')}</p>
          <div className="space-y-0.5">{unpinnedItems.map((item) => renderMoreRow(item))}</div>
        </Flyout>
      )}

      {menu && (
        <Flyout anchor={menu.anchor} onClose={() => setMenu(null)} width={224}>
          {unpinnedIds.includes(menu.to) ? (
            <button
              type="button"
              onClick={() => pinItem(menu.to)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              <Pin className="h-4 w-4 text-slate-500" />
              {t('nav.pin')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => unpinItem(menu.to)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              <PinOff className="h-4 w-4 text-slate-500" />
              {t('nav.unpin')}
            </button>
          )}
        </Flyout>
      )}

      {tip &&
        createPortal(
          <div
            role="tooltip"
            style={{ top: tip.top, left: tip.left }}
            className="pointer-events-none fixed z-[310] -translate-y-1/2 whitespace-nowrap rounded-md bg-[#1f2933] px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
          >
            {tip.label}
          </div>,
          document.body,
        )}
    </aside>
  );
}
