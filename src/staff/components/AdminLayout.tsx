import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabaseBrowser } from '../lib/supabase';
import OnboardingTour from './OnboardingTour';
import '../styles.css';

type ThemeMode = 'light' | 'dark';

export default function AdminLayout() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const current = document.documentElement.getAttribute('data-theme');
    return current === 'dark' ? 'dark' : 'light';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

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

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const tabs = [
    { href: '/staff/parks', label: 'Parks' },
    { href: '/staff/attractions', label: 'Attraktionen' },
    { href: '/staff/cameras', label: 'Kameras' },
    { href: '/staff/website-anfragen', label: 'Website' },
    { href: '/staff/support-ticket-kunden', label: 'Support' },
    { href: '/staff/ingestion-check', label: 'Ingestion' },
    { href: '/staff/system-health', label: 'Health' },
    { href: '/staff/hilfe', label: 'Hilfe' },
    { href: '/staff/einstellungen', label: 'Einstellungen' },
  ];

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
    <div className="staff-app">
    <div className="staff-container">
      <div className="topbar card">
        <div className="brand">
          <h1>Operator</h1>
        </div>
        <button
          type="button"
          className="secondary hamburger-btn"
          aria-label="Navigation umschalten"
          aria-expanded={mobileMenuOpen}
          aria-controls="main-navigation"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
        >
          {mobileMenuOpen ? 'Schliessen' : 'Menue'}
        </button>
        <div
          id="main-navigation"
          className={`nav-links nav-links-single ${mobileMenuOpen ? 'mobile-open' : ''}`}
        >
          {tabs.map((tab) => (
            <NavLink
              key={tab.href}
              to={tab.href}
              data-tour={tab.href === '/staff/hilfe' ? 'nav-help' : undefined}
              className={location.pathname === tab.href ? 'active' : ''}
              onClick={() => setMobileMenuOpen(false)}
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="secondary theme-toggle-btn"
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Hellen Modus aktivieren' : 'Dunklen Modus aktivieren'}
          >
            {theme === 'dark' ? 'Hellmodus' : 'Dunkelmodus'}
          </button>
          <button
            className="secondary logout-btn"
            onClick={async () => {
              await supabaseBrowser.auth.signOut();
              window.location.href = '/staff/login';
            }}
          >
            Logout
          </button>
        </div>
      </div>
      <Outlet />
      <OnboardingTour />
    </div>
    </div>
  );
}
