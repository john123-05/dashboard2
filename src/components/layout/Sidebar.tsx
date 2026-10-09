import { useEffect, useRef, useState } from 'react';
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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  UserCog,
  Package,
  Store,
  X,
  Sun,
  Moon,
  MoreHorizontal,
  Pin,
  PinOff,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../lib/i18n';
import { usePark } from '../../contexts/ParkContext';
import { supabase } from '../../lib/supabase';
import ProfileParkSwitcher from './ProfileParkSwitcher';

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
};

const navItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, labelKey: 'nav.overview', comingSoon: true, kioskUnlocks: true },
  { to: '/revenue', icon: DollarSign, labelKey: 'nav.revenue', comingSoon: true, kioskUnlocks: true },
  { to: '/purchases', icon: ShoppingCart, labelKey: 'nav.purchases', comingSoon: true, kioskUnlocks: true },
  { to: '/users', icon: Users, labelKey: 'nav.speed', comingSoon: true, guestActivityUnlocks: true },
  { to: '/photos', icon: Camera, labelKey: 'nav.photos', staffAllowed: true },
  { to: '/leads', icon: Mail, labelKey: 'nav.leads' },
  { to: '/personalization', icon: Wand2, labelKey: 'nav.personalization', staffAllowed: true },
  { to: '/tickets', icon: LifeBuoy, labelKey: 'nav.support', staffAllowed: true },
  { to: '/health', icon: Activity, labelKey: 'nav.system_health', staffAllowed: true },
  { to: '/kamera', icon: Camera, labelKey: 'nav.camera', staffAllowed: true },
  { to: '/configuration', icon: Package, labelKey: 'nav.configuration' },
  { to: '/shop', icon: Store, labelKey: 'nav.shop', upgrade: true },
  { to: '/team', icon: UserCog, labelKey: 'nav.team', ownerOnly: true },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings' },
];

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
  // Scaffolding only for now: persists the choice and tags <html> so the
  // rest of the dashboard's pages can opt into dark styles later without
  // touching this component again. No page actually has dark styles yet,
  // so toggling this doesn't visibly change anything beyond its own icon.
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

  // Custom drag order, per account. Items not in it yet (nothing reordered
  // so far, or a nav item added after the user last reordered) keep their
  // default relative position, appended after the known ones.
  const itemOrder = profile?.nav_item_order ?? [];
  const visibleItems = [...visibleItemsDefaultOrder].sort((a, b) => {
    const ai = itemOrder.indexOf(a.to);
    const bi = itemOrder.indexOf(b.to);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  // Which items the user moved into "Mehr" - per account (operator_profiles),
  // not per device, so it follows them to another browser/computer.
  const unpinnedIds = profile?.nav_unpinned_items ?? [];
  const pinnedItems = visibleItems.filter((item) => !unpinnedIds.includes(item.to));
  const unpinnedItems = visibleItems.filter((item) => unpinnedIds.includes(item.to));

  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpenFor) return;
    function onClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenFor(null);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpenFor]);

  async function setUnpinned(next: string[]) {
    setMenuOpenFor(null);
    if (!profile) return;
    await supabase.from('operator_profiles').update({ nav_unpinned_items: next }).eq('id', profile.id);
    await refreshProfile();
  }

  function unpinItem(to: string) {
    if (!unpinnedIds.includes(to)) void setUnpinned([...unpinnedIds, to]);
  }

  function pinItem(to: string) {
    void setUnpinned(unpinnedIds.filter((id) => id !== to));
  }

  // Drag-to-reorder within the pinned list only (native HTML5 DnD - mouse
  // only, no touch support, acceptable for an admin dashboard used on desktop).
  const [draggedTo, setDraggedTo] = useState<string | null>(null);

  async function persistOrder(nextPinnedOrder: string[]) {
    if (!profile) return;
    // Keep unpinned items' relative order at the end, untouched.
    const fullOrder = [...nextPinnedOrder, ...unpinnedItems.map((i) => i.to)];
    await supabase.from('operator_profiles').update({ nav_item_order: fullOrder }).eq('id', profile.id);
    await refreshProfile();
  }

  function onDropOnto(targetTo: string) {
    if (!draggedTo || draggedTo === targetTo) {
      setDraggedTo(null);
      return;
    }
    const order = pinnedItems.map((i) => i.to);
    const from = order.indexOf(draggedTo);
    const to = order.indexOf(targetTo);
    if (from === -1 || to === -1) {
      setDraggedTo(null);
      return;
    }
    order.splice(from, 1);
    order.splice(to, 0, draggedTo);
    setDraggedTo(null);
    void persistOrder(order);
  }

  function renderNavRow(item: NavItem, pinned: boolean) {
    const isActive =
      item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
    const showComingSoon =
      item.comingSoon &&
      !(item.kioskUnlocks && isKioskPark) &&
      !(item.guestActivityUnlocks && isTarzansPark);
    const badge = showComingSoon
      ? item.guestActivityUnlocks
        ? t('nav.upgrade')
        : t('nav.coming_soon')
      : item.upgrade
        ? t('nav.upgrade')
        : null;
    const menuOpen = menuOpenFor === item.to;
    const draggable = showFull && pinned;

    return (
      <div
        key={item.to}
        className={`group/row relative flex items-center ${draggedTo === item.to ? 'opacity-40' : ''}`}
        draggable={draggable}
        onDragStart={(event) => {
          if (!draggable) return;
          // Firefox silently refuses the whole drag unless dataTransfer
          // actually carries something.
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', item.to);
          setDraggedTo(item.to);
        }}
        onDragOver={(event) => {
          if (!draggable) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(event) => {
          if (!draggable) return;
          event.preventDefault();
          onDropOnto(item.to);
        }}
        onDragEnd={() => setDraggedTo(null)}
      >
        <NavLink
          to={item.to}
          draggable={false}
          className={`group flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
            isActive
              ? 'bg-white/[0.12] text-white shadow-sm shadow-black/10'
              : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
          } ${showFull ? (showFull && pinned ? 'pr-8' : '') : 'justify-center'} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
          title={
            showFull
              ? undefined
              : `${t(item.labelKey)}${badge ? ` (${badge})` : ''}`
          }
        >
          <item.icon
            className={`h-[18px] w-[18px] shrink-0 transition-colors ${
              isActive ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-300'
            }`}
          />
          {showFull && (
            <span className="animate-fade-in truncate">
              {t(item.labelKey)}
              {badge && <span className="ml-1 text-xs text-slate-500">({badge})</span>}
            </span>
          )}
        </NavLink>

        {showFull && (
          <div className="absolute right-1">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                setMenuOpenFor(menuOpen ? null : item.to);
              }}
              className={`rounded-lg p-1 text-slate-400 transition-opacity hover:bg-white/[0.08] hover:text-white ${
                menuOpen ? 'opacity-100' : 'opacity-60 group-hover/row:opacity-100'
              }`}
              title={t('nav.options')}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            {menuOpen && (
              <div
                ref={menuRef}
                className="absolute right-0 top-full z-40 mt-1 w-56 rounded-xl border border-white/10 bg-[#1b1d24] p-1 shadow-xl"
              >
                {pinned ? (
                  <button
                    type="button"
                    onClick={() => unpinItem(item.to)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/[0.08]"
                  >
                    <PinOff className="h-4 w-4 text-slate-400" />
                    {t('nav.unpin')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => pinItem(item.to)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/[0.08]"
                  >
                    <Pin className="h-4 w-4 text-slate-400" />
                    {t('nav.pin')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside
      className={`glass-sidebar fixed inset-y-0 left-0 z-30 flex flex-col transition-all duration-300 ${
        collapsed ? 'w-[72px]' : 'w-64'
      } ${mobileOpen ? 'mobile-open' : ''}`}
    >
      <div className="flex h-16 items-center gap-3 border-b border-white/[0.06] px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center">
          <img
            src="https://xcrxltiiovpoladpaewd.supabase.co/storage/v1/object/public/test/Liftpicutures%20Logo%20alt.jpg"
            alt="Liftpictures"
            className="h-9 w-9 rounded-xl object-cover"
            loading="lazy"
          />
        </div>
        {showFull && (
          <div className="animate-fade-in overflow-hidden">
            <h1 className="text-sm font-bold tracking-tight text-white">Liftpictures</h1>
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

      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        <div className="space-y-1">
          {/* Collapsed rail has no room for a "Mehr" flyout, so it ignores the
              pin split entirely - nothing becomes unreachable just because
              the sidebar happens to be collapsed. */}
          {(showFull ? pinnedItems : visibleItems).map((item) => renderNavRow(item, true))}
        </div>

        {showFull && unpinnedItems.length > 0 && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
            >
              <MoreHorizontal className="h-[18px] w-[18px] shrink-0 text-slate-500" />
              <span className="flex-1 text-left">{t('nav.more')}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
            </button>
            {moreOpen && (
              <div className="mt-1 space-y-1 border-l border-white/[0.06] pl-2">
                {unpinnedItems.map((item) => renderNavRow(item, false))}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        {showFull && <ProfileParkSwitcher onSwitched={onCloseMobile} />}

        <div className={`flex ${showFull ? '' : 'flex-col'} gap-1`}>
          <button
            onClick={async () => {
              setPark(null, null);
              await signOut();
            }}
            className="flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-rose-400"
            title={t('nav.sign_out')}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {showFull && <span>{t('nav.sign_out')}</span>}
          </button>

          <button
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            className="flex items-center justify-center rounded-xl px-3 py-2 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
            title={theme === 'dark' ? t('nav.light_mode') : t('nav.dark_mode')}
          >
            {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>

          <button
            onClick={onToggleCollapsed}
            className="mobile-nav-hide-collapse-btn flex items-center justify-center rounded-xl px-3 py-2 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
            title={collapsed ? t('nav.expand_sidebar') : t('nav.collapse_sidebar')}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
