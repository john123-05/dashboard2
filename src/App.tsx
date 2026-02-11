import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import { I18nProvider } from './lib/i18n';

export default function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route element={<DashboardLayout />}>
              <Route path="/" element={<Overview />} />
              <Route path="/revenue" element={<Revenue />} />
              <Route path="/purchases" element={<Purchases />} />
              <Route path="/users" element={<Users />} />
              <Route path="/photos" element={<Photos />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/personalization" element={<Personalization />} />
              <Route path="/support" element={<Support />} />
              <Route path="/health" element={<SystemHealth />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Routes>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
