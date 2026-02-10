import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  DollarSign,
  ShoppingCart,
  Users,
  Camera,
  Mail,
  LifeBuoy,
  Activity,
  Settings,
  LogOut,
  Mountain,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useState } from 'react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/revenue', icon: DollarSign, label: 'Revenue' },
  { to: '/purchases', icon: ShoppingCart, label: 'Purchases' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/photos', icon: Camera, label: 'Photos' },
  { to: '/leads', icon: Mail, label: 'Leads' },
  { to: '/support', icon: LifeBuoy, label: 'Support' },
  { to: '/health', icon: Activity, label: 'System Health' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const { profile, currentOrg, signOut } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`glass-sidebar fixed inset-y-0 left-0 z-30 flex flex-col transition-all duration-300 ${
        collapsed ? 'w-[72px]' : 'w-64'
      }`}
    >
      <div className="flex h-16 items-center gap-3 border-b border-white/[0.06] px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/20">
          <Mountain className="h-5 w-5 text-brand-400" />
        </div>
        {!collapsed && (
          <div className="animate-fade-in overflow-hidden">
            <h1 className="text-sm font-bold tracking-tight text-white">Liftpictures</h1>
            <p className="truncate text-[11px] text-slate-400">
              {currentOrg?.name || 'Operator Dashboard'}
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.to}
                to={item.to}
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
                {!collapsed && <span className="animate-fade-in">{item.label}</span>}
              </NavLink>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        {!collapsed && profile && (
          <div className="mb-3 rounded-xl bg-white/[0.06] px-3 py-2.5">
            <p className="truncate text-sm font-medium text-slate-200">
              {profile.full_name}
            </p>
            <p className="truncate text-xs text-slate-500">{profile.email}</p>
          </div>
        )}

        <div className={`flex ${collapsed ? 'flex-col' : ''} gap-1`}>
          <button
            onClick={signOut}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-rose-400 ${
              collapsed ? 'justify-center' : 'flex-1'
            }`}
            title="Sign out"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center rounded-xl px-3 py-2 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
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
