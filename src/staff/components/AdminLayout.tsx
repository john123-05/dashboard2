import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabaseBrowser } from '../lib/supabase';
import GlobalSearchWidget from './GlobalSearchWidget';
import OnboardingTour from './OnboardingTour';
import StaffSidebar from './StaffSidebar';
import '../styles.css';

type ThemeMode = 'light' | 'dark';

export default function AdminLayout() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const current = document.documentElement.getAttribute('data-theme');
    return current === 'dark' ? 'dark' : 'light';
  });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        navigate('/staff/login', { replace: true });
        return;
      }

      const { data: userData, error: userError } = await supabaseBrowser.auth.getUser();
      if (userError || !userData.user) {
        await supabaseBrowser.auth.signOut();
        navigate('/staff/login', { replace: true });
        return;
      }

      const { data, error: adminError } = await supabaseBrowser
        .from('admin_users')
        .select('user_id')
        .eq('user_id', userData.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (adminError) {
        setError(adminError.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setError('Kein Admin-Zugriff für diesen User. Bitte in public.admin_users eintragen.');
        setLoading(false);
        return;
      }

      setAdminEmail(userData.user.email ?? null);
      setAuthorized(true);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('lp-theme', theme);
  }, [theme]);

  if (loading) {
    return (
      <div className="staff-app">
        <div className="staff-container">
          <p>Lade Admin-Sitzung...</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="staff-app">
        <div className="staff-container">
          <h1>Admin-Zugriff verweigert</h1>
          {error && <p className="error">{error}</p>}
          <NavLink to="/staff/login" className="note">
            Zum Login
          </NavLink>
        </div>
      </div>
    );
  }

  return (
    <div className="staff-app flex min-h-screen">
      {mobileNavOpen && (
        <div className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} />
      )}
      <StaffSidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((prev) => !prev)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        adminEmail={adminEmail}
        onSignOut={async () => {
          await supabaseBrowser.auth.signOut();
          window.location.href = '/staff/login';
        }}
      />
      {!mobileNavOpen && (
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-label="Navigation oeffnen"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
      )}
      <main
        className="staff-main flex-1 transition-all duration-300"
        style={{ paddingLeft: collapsed ? 72 : 256 }}
      >
        <div className="staff-container">
          <Outlet />
        </div>
      </main>
      <OnboardingTour />
      <GlobalSearchWidget />
    </div>
  );
}
