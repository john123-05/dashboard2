import { Suspense, useEffect } from 'react';
import { seiteNachladen, NachladeGrenze } from './lib/seiteNachladen';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import DashboardLayout from './components/layout/DashboardLayout';
import Login from './pages/Login';
const Register = seiteNachladen(() => import('./pages/Register'));
const Overview = seiteNachladen(() => import('./pages/Overview'));
const Revenue = seiteNachladen(() => import('./pages/Revenue'));
const Purchases = seiteNachladen(() => import('./pages/Purchases'));
const Users = seiteNachladen(() => import('./pages/Users'));
const Photos = seiteNachladen(() => import('./pages/Photos'));
const Leads = seiteNachladen(() => import('./pages/Leads'));
const Personalization = seiteNachladen(() => import('./pages/Personalization'));
const Support = seiteNachladen(() => import('./pages/Support'));
const SystemHealth = seiteNachladen(() => import('./pages/SystemHealth'));
const Settings = seiteNachladen(() => import('./pages/Settings'));
const PrivacyPolicy = seiteNachladen(() => import('./pages/PrivacyPolicy'));
const LegalSupport = seiteNachladen(() => import('./pages/LegalSupport'));
import { I18nProvider } from './lib/i18n';
import { ParkProvider } from './contexts/ParkContext';
import ComingSoonOverlay from './components/ComingSoonOverlay';
import KioskAwareOverlay from './components/KioskAwareOverlay';
import OwnerOnly from './components/OwnerOnly';
const Team = seiteNachladen(() => import('./pages/Team'));
const StaffAdminLayout = seiteNachladen(() => import('./staff/components/AdminLayout'));
const StaffLoginPage = seiteNachladen(() => import('./staff/pages/StaffLoginPage'));
const StaffSupportTicketKundenPage = seiteNachladen(() => import('./staff/pages/SupportTicketKundenPage'));
const StaffSystemHealthPage = seiteNachladen(() => import('./staff/pages/StaffSystemHealthPage'));
const StaffSettingsPage = seiteNachladen(() => import('./staff/pages/StaffSettingsPage'));
const StaffHelpPage = seiteNachladen(() => import('./staff/pages/HelpPage'));
const StaffMarketingMaterialsPage = seiteNachladen(() => import('./staff/pages/MarketingMaterialsPage'));
const StaffUploaderInstallPage = seiteNachladen(() => import('./staff/pages/UploaderInstallPage'));
const StaffPasswordsPage = seiteNachladen(() => import('./staff/pages/PasswordsPage'));
const StaffMediaLibraryPage = seiteNachladen(() => import('./staff/pages/MediaLibraryPage'));
const StaffCostsPage = seiteNachladen(() => import('./staff/pages/CostsPage'));
const StaffCustomerManagementPage = seiteNachladen(() => import('./staff/pages/CustomerManagementPage'));
const StaffOverviewPage = seiteNachladen(() => import('./staff/pages/OverviewPage'));
const StaffOfferBuilderPage = seiteNachladen(() => import('./staff/pages/OfferBuilderPage'));
const StaffWebsiteAnfragenPage = seiteNachladen(() => import('./staff/pages/WebsiteAnfragenPage'));

function AppShellMetaController() {
  const location = useLocation();

  useEffect(() => {
    const isStaffRoute = location.pathname.startsWith('/staff');
    const manifestHref = isStaffRoute ? '/manifest-staff.webmanifest' : '/manifest-operator.webmanifest';
    const staffTitle = (() => {
      if (location.pathname === '/staff/kunden-management') {
        return 'Kunden Management';
      }

      if (location.pathname === '/staff/website-anfragen') return 'Interessenten & Anfragen';
      if (location.pathname === '/staff/angebot-erstellen') return 'Angebot erstellen';
      if (location.pathname === '/staff/uebersicht') return 'Übersicht';
      if (location.pathname === '/staff/werbematerialien') return 'Werbematerialien';
      if (location.pathname === '/staff/kosten') return 'Kosten';
      if (location.pathname === '/staff/passwoerter') return 'Passwörter';
      if (location.pathname === '/staff/medien') return 'Medien';
      if (location.pathname === '/staff/support-ticket-kunden') return 'Support';
      if (location.pathname === '/staff/system-health') return 'Health';
      if (location.pathname === '/staff/hilfe') return 'Hilfe';
      if (location.pathname === '/staff/einstellungen') return 'Einstellungen';
      if (location.pathname === '/staff/login') return 'Staff Login';

      return 'Liftpictures Super Admin';
    })();
    const title = isStaffRoute ? `${staffTitle} - Liftpictures Super Admin` : 'Liftpictures Operator Dashboard';
    const appTitle = isStaffRoute ? 'Liftpictures Super Admin' : 'Liftpictures Operator';

    document.title = title;

    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifestLink && manifestLink.getAttribute('href') !== manifestHref) {
      manifestLink.setAttribute('href', manifestHref);
    }

    const appleTitleMeta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    if (appleTitleMeta) {
      appleTitleMeta.setAttribute('content', appTitle);
    }

    const applicationNameMeta = document.querySelector<HTMLMetaElement>('meta[name="application-name"]');
    if (applicationNameMeta) {
      applicationNameMeta.setAttribute('content', appTitle);
    }
  }, [location.pathname, location.search]);

  return null;
}

/**
 * Was waehrend des Nachladens einer Seite dasteht.
 *
 * Bewusst schlicht: sie ist meist nur Millisekunden sichtbar, und ein
 * aufwendiger Platzhalter waere selbst wieder Ladezeit.
 */
function Ladeanzeige() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShellMetaController />
      <I18nProvider>
        <AuthProvider>
          <ParkProvider>
            <NachladeGrenze>
            <Suspense fallback={<Ladeanzeige />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/support" element={<LegalSupport />} />
              <Route element={<DashboardLayout />}>
                <Route
                  path="/"
                  element={
                    <OwnerOnly>
                      <KioskAwareOverlay description="Die Übersicht zeigt dir auf einen Blick die wichtigsten Zahlen deines Parks — zum Beispiel wie viele Fotos verkauft wurden und wie sich der Umsatz entwickelt.">
                        <Overview />
                      </KioskAwareOverlay>
                    </OwnerOnly>
                  }
                />
                <Route
                  path="/revenue"
                  element={
                    <OwnerOnly>
                      <KioskAwareOverlay description="Hier siehst du deinen Umsatz im Detail — zum Beispiel wie viel du pro Tag oder pro Attraktion eingenommen hast.">
                        <Revenue />
                      </KioskAwareOverlay>
                    </OwnerOnly>
                  }
                />
                <Route
                  path="/purchases"
                  element={
                    <OwnerOnly>
                      <KioskAwareOverlay description="Hier siehst du alle Käufe deiner Gäste im Überblick — wer wann was gekauft und wie viel bezahlt hat.">
                        <Purchases />
                      </KioskAwareOverlay>
                    </OwnerOnly>
                  }
                />
                <Route
                  path="/users"
                  element={
                    <OwnerOnly>
                      <ComingSoonOverlay description="Hier findest du alle registrierten Nutzer-Accounts deines Parks — also Gäste, die sich für den Foto-Shop angemeldet haben.">
                        <Users />
                      </ComingSoonOverlay>
                    </OwnerOnly>
                  }
                />
                <Route path="/photos" element={<Photos />} />
                <Route path="/leads" element={<OwnerOnly><Leads /></OwnerOnly>} />
                <Route path="/personalization" element={<Personalization />} />
                <Route path="/tickets" element={<Support />} />
                <Route path="/health" element={<SystemHealth />} />
                <Route path="/team" element={<OwnerOnly><Team /></OwnerOnly>} />
                <Route path="/settings" element={<OwnerOnly><Settings /></OwnerOnly>} />
              </Route>

              {/* Internal LiftPictures staff tool — reached via the "Liftpictures Mitarbeiter?"
                  link in the footer, entirely separate auth (admin_users on the shared
                  production project) from the customer-facing dashboard above. */}
              <Route path="/staff/login" element={<StaffLoginPage />} />
              <Route element={<StaffAdminLayout />}>
                <Route path="/staff" element={<Navigate to="/staff/uebersicht" replace />} />
                <Route path="/staff/uebersicht" element={<StaffOverviewPage />} />
                <Route path="/staff/kunden-management" element={<StaffCustomerManagementPage />} />
                <Route path="/staff/parks" element={<Navigate to="/staff/kunden-management?tab=parks" replace />} />
                <Route path="/staff/cameras" element={<Navigate to="/staff/kunden-management?tab=cameras" replace />} />
                <Route path="/staff/liftpic-setup" element={<Navigate to="/staff/kunden-management?tab=liftpic" replace />} />
                <Route path="/staff/support-ticket-kunden" element={<StaffSupportTicketKundenPage />} />
                <Route path="/staff/website-anfragen" element={<StaffWebsiteAnfragenPage />} />
                <Route path="/staff/angebot-erstellen" element={<StaffOfferBuilderPage />} />
                <Route path="/staff/system-health" element={<StaffSystemHealthPage />} />
                <Route path="/staff/einstellungen" element={<StaffSettingsPage />} />
                <Route path="/staff/hilfe" element={<StaffHelpPage />} />
                <Route path="/staff/werbematerialien" element={<StaffMarketingMaterialsPage />} />
                <Route path="/staff/werbematerialien/uploader-installation" element={<StaffUploaderInstallPage />} />
                <Route path="/staff/passwoerter" element={<StaffPasswordsPage />} />
                <Route path="/staff/medien" element={<StaffMediaLibraryPage />} />
                <Route path="/staff/kosten" element={<StaffCostsPage />} />
              </Route>
            </Routes>
            </Suspense>
            </NachladeGrenze>
          </ParkProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
