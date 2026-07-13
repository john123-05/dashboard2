import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import StaffAdminLayout from './staff/components/AdminLayout';
import StaffLoginPage from './staff/pages/StaffLoginPage';
import StaffParksPage from './staff/pages/ParksPage';
import StaffCamerasPage from './staff/pages/CamerasPage';
import StaffSupportTicketKundenPage from './staff/pages/SupportTicketKundenPage';
import StaffWebsiteAnfragenPage from './staff/pages/WebsiteAnfragenPage';
import StaffSystemHealthPage from './staff/pages/StaffSystemHealthPage';
import StaffSettingsPage from './staff/pages/StaffSettingsPage';
import StaffHelpPage from './staff/pages/HelpPage';
import StaffMarketingMaterialsPage from './staff/pages/MarketingMaterialsPage';
import StaffUploaderInstallPage from './staff/pages/UploaderInstallPage';
import StaffPasswordsPage from './staff/pages/PasswordsPage';
import StaffMediaLibraryPage from './staff/pages/MediaLibraryPage';

export default function App() {
  return (
    <BrowserRouter>
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
                    <KioskAwareOverlay description="Die Übersicht zeigt dir auf einen Blick die wichtigsten Zahlen deines Parks — zum Beispiel wie viele Fotos verkauft wurden und wie sich der Umsatz entwickelt.">
                      <Overview />
                    </KioskAwareOverlay>
                  }
                />
                <Route
                  path="/revenue"
                  element={
                    <KioskAwareOverlay description="Hier siehst du deinen Umsatz im Detail — zum Beispiel wie viel du pro Tag oder pro Attraktion eingenommen hast.">
                      <Revenue />
                    </KioskAwareOverlay>
                  }
                />
                <Route
                  path="/purchases"
                  element={
                    <KioskAwareOverlay description="Hier siehst du alle Käufe deiner Gäste im Überblick — wer wann was gekauft und wie viel bezahlt hat.">
                      <Purchases />
                    </KioskAwareOverlay>
                  }
                />
                <Route
                  path="/users"
                  element={
                    <ComingSoonOverlay description="Hier findest du alle registrierten Nutzer-Accounts deines Parks — also Gäste, die sich für den Foto-Shop angemeldet haben.">
                      <Users />
                    </ComingSoonOverlay>
                  }
                />
                <Route path="/photos" element={<Photos />} />
                <Route path="/leads" element={<Leads />} />
                <Route
                  path="/personalization"
                  element={
                    <ComingSoonOverlay description="Hier kannst du das Aussehen und die Texte deines Foto-Shops anpassen — zum Beispiel Farben, Logo oder Begrüßungstexte.">
                      <Personalization />
                    </ComingSoonOverlay>
                  }
                />
                <Route
                  path="/tickets"
                  element={
                    <ComingSoonOverlay description="Hier landen Anfragen und Support-Tickets von Gästen, die Hilfe brauchen — zum Beispiel bei Problemen mit einem Kauf.">
                      <Support />
                    </ComingSoonOverlay>
                  }
                />
                <Route
                  path="/health"
                  element={
                    <ComingSoonOverlay description="Hier siehst du, ob technisch alles rund läuft — zum Beispiel ob die Kamera-Anbindung und die Bezahlung fehlerfrei funktionieren.">
                      <SystemHealth />
                    </ComingSoonOverlay>
                  }
                />
                <Route path="/settings" element={<Settings />} />
              </Route>

              {/* Internal LiftPictures staff tool — reached via the "Liftpictures Mitarbeiter?"
                  link in the footer, entirely separate auth (admin_users on the shared
                  production project) from the customer-facing dashboard above. */}
              <Route path="/staff/login" element={<StaffLoginPage />} />
              <Route element={<StaffAdminLayout />}>
                <Route path="/staff" element={<Navigate to="/staff/parks" replace />} />
                <Route path="/staff/parks" element={<StaffParksPage />} />
                <Route path="/staff/cameras" element={<StaffCamerasPage />} />
                <Route path="/staff/support-ticket-kunden" element={<StaffSupportTicketKundenPage />} />
                <Route path="/staff/website-anfragen" element={<StaffWebsiteAnfragenPage />} />
                <Route path="/staff/system-health" element={<StaffSystemHealthPage />} />
                <Route path="/staff/einstellungen" element={<StaffSettingsPage />} />
                <Route path="/staff/hilfe" element={<StaffHelpPage />} />
                <Route path="/staff/werbematerialien" element={<StaffMarketingMaterialsPage />} />
                <Route path="/staff/werbematerialien/uploader-installation" element={<StaffUploaderInstallPage />} />
                <Route path="/staff/passwoerter" element={<StaffPasswordsPage />} />
                <Route path="/staff/medien" element={<StaffMediaLibraryPage />} />
              </Route>
            </Routes>
          </ParkProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
