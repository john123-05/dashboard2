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
  UserCog,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../lib/i18n';
import { usePark } from '../../contexts/ParkContext';

type NavItem = {
  to: string;
  icon: typeof LayoutDashboard;
  labelKey: string;
  label?: string;
  comingSoon?: boolean;
  kioskUnlocks?: boolean;
  // Visible to the restricted "staff" role. Everything else is owner-only.
  staffAllowed?: boolean;
  ownerOnly?: boolean;
};

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const navItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, labelKey: 'nav.overview', comingSoon: true, kioskUnlocks: true },
  { to: '/revenue', icon: DollarSign, labelKey: 'nav.revenue', comingSoon: true, kioskUnlocks: true },
  { to: '/purchases', icon: ShoppingCart, labelKey: 'nav.purchases', comingSoon: true, kioskUnlocks: true },
  { to: '/users', icon: Users, labelKey: 'nav.users', comingSoon: true },
  { to: '/photos', icon: Camera, labelKey: 'nav.photos', staffAllowed: true },
  { to: '/leads', icon: Mail, labelKey: 'nav.leads' },
  { to: '/personalization', icon: Wand2, labelKey: 'nav.personalization', staffAllowed: true },
  { to: '/tickets', icon: LifeBuoy, labelKey: 'nav.support', staffAllowed: true },
  { to: '/health', icon: Activity, labelKey: 'nav.system_health', staffAllowed: true },
  { to: '/team', icon: UserCog, labelKey: 'nav.team', label: 'Mitarbeiter', ownerOnly: true },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings' },
];

export default function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const { profile, currentOrg, signOut, isStaff, isOwner } = useAuth();
  const location = useLocation();
  const { t } = useI18n();
  const { parkName, setPark, isKioskPark } = usePark();
  const showFull = !collapsed || mobileOpen;

  const visibleItems = navItems.filter((item) => {
    if (isStaff) return item.staffAllowed;
    if (item.ownerOnly) return isOwner;
    return true;
  });

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
          className="operator-mobile-nav-close"
          aria-label="Navigation schließen"
          onClick={onCloseMobile}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        <div className="space-y-1">
          {visibleItems.map((item) => {
            const isActive =
              item.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.to);
            const showComingSoon = item.comingSoon && !(item.kioskUnlocks && isKioskPark);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-white/[0.12] text-white shadow-sm shadow-black/10'
                    : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
                } ${showFull ? '' : 'justify-center'}`}
                title={
                  collapsed
                    ? `${item.label ?? t(item.labelKey)}${showComingSoon ? ` (${t('nav.coming_soon')})` : ''}`
                    : undefined
                }
                onClick={onCloseMobile}
              >
                <item.icon
                  className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                    isActive ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                />
                {showFull && (
                  <span className="animate-fade-in truncate">
                    {item.label ?? t(item.labelKey)}
                    {showComingSoon && (
                      <span className="ml-1 text-xs text-slate-500">({t('nav.coming_soon')})</span>
                    )}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        {showFull && profile && (
          <div className="mb-3 rounded-xl bg-white/[0.06] px-3 py-2.5">
            <p className="truncate text-sm font-medium text-slate-200">
              {profile.full_name}
            </p>
            <p className="truncate text-xs text-slate-500">{profile.email}</p>
          </div>
        )}

        <div className={`flex ${collapsed ? 'flex-col' : ''} gap-1`}>
          <button
            onClick={async () => {
              onCloseMobile();
              setPark(null, null);
              await signOut();
            }}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-rose-400 ${
              showFull ? 'flex-1' : 'justify-center'
            }`}
            title={t('nav.sign_out')}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {showFull && <span>{t('nav.sign_out')}</span>}
          </button>

          <button
            onClick={onToggleCollapsed}
            className="operator-mobile-nav-hide-collapse-btn flex items-center justify-center rounded-xl px-3 py-2 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
