import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import DashboardLayout from './components/layout/DashboardLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Overview from './pages/Overview';
import Revenue from './pages/Revenue';
import Purchases from './pages/Purchases';
import Users from './pages/Users';
import Photos from './pages/Photos';
import Leads from './pages/Leads';
import Personalization from './pages/Personalization';
import Support from './pages/Support';
import SystemHealth from './pages/SystemHealth';
import Settings from './pages/Settings';
import PrivacyPolicy from './pages/PrivacyPolicy';
import LegalSupport from './pages/LegalSupport';
import { I18nProvider } from './lib/i18n';
import { ParkProvider } from './contexts/ParkContext';
import ComingSoonOverlay from './components/ComingSoonOverlay';
import KioskAwareOverlay from './components/KioskAwareOverlay';
import OwnerOnly from './components/OwnerOnly';
import Team from './pages/Team';
import StaffAdminLayout from './staff/components/AdminLayout';
import StaffLoginPage from './staff/pages/StaffLoginPage';
import StaffSupportTicketKundenPage from './staff/pages/SupportTicketKundenPage';
import StaffWebsiteAnfragenPage from './staff/pages/WebsiteAnfragenPage';
import StaffSystemHealthPage from './staff/pages/StaffSystemHealthPage';
import StaffSettingsPage from './staff/pages/StaffSettingsPage';
import StaffHelpPage from './staff/pages/HelpPage';
import StaffMarketingMaterialsPage from './staff/pages/MarketingMaterialsPage';
import StaffUploaderInstallPage from './staff/pages/UploaderInstallPage';
import StaffPasswordsPage from './staff/pages/PasswordsPage';
import StaffMediaLibraryPage from './staff/pages/MediaLibraryPage';
import StaffCostsPage from './staff/pages/CostsPage';
import StaffCustomerManagementPage from './staff/pages/CustomerManagementPage';
import StaffOverviewPage from './staff/pages/OverviewPage';

function AppShellMetaController() {
  const location = useLocation();

  useEffect(() => {
    const isStaffRoute = location.pathname.startsWith('/staff');
    const manifestHref = isStaffRoute ? '/manifest-staff.webmanifest' : '/manifest-operator.webmanifest';
    const title = isStaffRoute ? 'Liftpictures Super Admin' : 'Liftpictures Operator Dashboard';
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
  }, [location.pathname]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShellMetaController />
      <I18nProvider>
        <AuthProvider>
          <ParkProvider>
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
          </ParkProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
