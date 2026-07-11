import { NavLink, useLocation } from 'react-router-dom';
import {
  Mountain,
  Megaphone,
  Camera,
  Globe,
  LifeBuoy,
  Activity,
  HelpCircle,
  KeyRound,
  Images,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
} from 'lucide-react';

const navItems = [
  { to: '/staff/parks', icon: Mountain, label: 'Parks anlegen' },
  { to: '/staff/werbematerialien', icon: Megaphone, label: 'Werbematerialien', tourTag: undefined },
  { to: '/staff/passwoerter', icon: KeyRound, label: 'Passwörter' },
  { to: '/staff/medien', icon: Images, label: 'Medien' },
  { to: '/staff/cameras', icon: Camera, label: 'Kameras' },
  { to: '/staff/website-anfragen', icon: Globe, label: 'Interessenten und Anfragen' },
  { to: '/staff/support-ticket-kunden', icon: LifeBuoy, label: 'Support' },
  { to: '/staff/system-health', icon: Activity, label: 'Health' },
  { to: '/staff/hilfe', icon: HelpCircle, label: 'Hilfe', tourTag: 'nav-help' },
  { to: '/staff/einstellungen', icon: Settings, label: 'Einstellungen' },
];

interface StaffSidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  adminEmail: string | null;
  onSignOut: () => void;
}

export default function StaffSidebar({
  collapsed,
  onToggleCollapsed,
  theme,
  onToggleTheme,
  adminEmail,
  onSignOut,
}: StaffSidebarProps) {
  const location = useLocation();

  return (
    <aside
      className={`glass-sidebar fixed inset-y-0 left-0 z-30 flex flex-col transition-all duration-300 ${
        collapsed ? 'w-[72px]' : 'w-64'
      }`}
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
        {!collapsed && (
          <div className="animate-fade-in overflow-hidden">
            <h1 className="text-sm font-bold tracking-tight text-white">Liftpictures</h1>
            <p className="truncate text-[11px] text-slate-400">Operator-Tools</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                data-tour={item.tourTag}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-white/[0.12] text-white shadow-sm shadow-black/10'
                    : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
                } ${collapsed ? 'justify-center' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon
                  className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                    isActive ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                />
                {!collapsed && <span className="animate-fade-in truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        {!collapsed && adminEmail && (
          <div className="mb-3 rounded-xl bg-white/[0.06] px-3 py-2.5">
            <p className="truncate text-xs text-slate-500">Eingeloggt als</p>
            <p className="truncate text-sm font-medium text-slate-200">{adminEmail}</p>
          </div>
        )}

        <div className={`flex ${collapsed ? 'flex-col' : ''} gap-1`}>
          <button
            onClick={onToggleTheme}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200 ${
              collapsed ? 'justify-center' : 'flex-1'
            }`}
            title={theme === 'dark' ? 'Hellmodus aktivieren' : 'Dunkelmodus aktivieren'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
            {!collapsed && <span>{theme === 'dark' ? 'Hellmodus' : 'Dunkelmodus'}</span>}
          </button>
        </div>

        <div className={`mt-1 flex ${collapsed ? 'flex-col' : ''} gap-1`}>
          <button
            onClick={onSignOut}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-rose-400 ${
              collapsed ? 'justify-center' : 'flex-1'
            }`}
            title="Logout"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>

          <button
            onClick={onToggleCollapsed}
            className="flex items-center justify-center rounded-xl px-3 py-2 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
            title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
