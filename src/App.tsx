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
import Operations from './pages/Operations';
import Errors from './pages/Errors';
import PrivacyPolicy from './pages/PrivacyPolicy';
import LegalSupport from './pages/LegalSupport';
import { I18nProvider } from './lib/i18n';
import { ParkProvider } from './contexts/ParkContext';
import StaffAdminLayout from './staff/components/AdminLayout';
import StaffLoginPage from './staff/pages/StaffLoginPage';
import StaffParksPage from './staff/pages/ParksPage';
import StaffAttractionsPage from './staff/pages/AttractionsPage';
import StaffCamerasPage from './staff/pages/CamerasPage';
import StaffSupportTicketKundenPage from './staff/pages/SupportTicketKundenPage';
import StaffIngestionCheckPage from './staff/pages/IngestionCheckPage';
import StaffWebsiteAnfragenPage from './staff/pages/WebsiteAnfragenPage';
import StaffSystemHealthPage from './staff/pages/StaffSystemHealthPage';
import StaffSettingsPage from './staff/pages/StaffSettingsPage';
import StaffHelpPage from './staff/pages/HelpPage';

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
                <Route path="/" element={<Overview />} />
                <Route path="/revenue" element={<Revenue />} />
                <Route path="/purchases" element={<Purchases />} />
                <Route path="/users" element={<Users />} />
                <Route path="/photos" element={<Photos />} />
                <Route path="/leads" element={<Leads />} />
                <Route path="/personalization" element={<Personalization />} />
                <Route path="/tickets" element={<Support />} />
                <Route path="/health" element={<SystemHealth />} />
                <Route path="/operations" element={<Operations />} />
                <Route path="/errors" element={<Errors />} />
                <Route path="/settings" element={<Settings />} />
              </Route>

              {/* Internal LiftPictures staff tool — reached via the "Liftpictures Mitarbeiter?"
                  link in the footer, entirely separate auth (admin_users on the shared
                  production project) from the customer-facing dashboard above. */}
              <Route path="/staff/login" element={<StaffLoginPage />} />
              <Route element={<StaffAdminLayout />}>
                <Route path="/staff" element={<Navigate to="/staff/parks" replace />} />
                <Route path="/staff/parks" element={<StaffParksPage />} />
                <Route path="/staff/attractions" element={<StaffAttractionsPage />} />
                <Route path="/staff/cameras" element={<StaffCamerasPage />} />
                <Route path="/staff/support-ticket-kunden" element={<StaffSupportTicketKundenPage />} />
                <Route path="/staff/ingestion-check" element={<StaffIngestionCheckPage />} />
                <Route path="/staff/website-anfragen" element={<StaffWebsiteAnfragenPage />} />
                <Route path="/staff/system-health" element={<StaffSystemHealthPage />} />
                <Route path="/staff/einstellungen" element={<StaffSettingsPage />} />
                <Route path="/staff/hilfe" element={<StaffHelpPage />} />
              </Route>
            </Routes>
          </ParkProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
