import { Suspense, useEffect } from 'react';
import { seiteNachladen, NachladeGrenze } from './lib/seiteNachladen';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import DashboardLayout from './components/layout/DashboardLayout';
import Login from './pages/Login';
const Register = seiteNachladen(() => import('./pages/Register'));
const Overview = seiteNachladen(() => import('./pages/Overview'));
const Ratgeber = seiteNachladen(() => import('./pages/Ratgeber'));
const RatgeberArticle = seiteNachladen(() => import('./pages/RatgeberArticle'));
const Revenue = seiteNachladen(() => import('./pages/Revenue'));
const Purchases = seiteNachladen(() => import('./pages/Purchases'));
const Users = seiteNachladen(() => import('./pages/Users'));
const Photos = seiteNachladen(() => import('./pages/Photos'));
const Leads = seiteNachladen(() => import('./pages/Leads'));
const Personalization = seiteNachladen(() => import('./pages/Personalization'));
const Support = seiteNachladen(() => import('./pages/Support'));
const SystemHealth = seiteNachladen(() => import('./pages/SystemHealth'));
const Kamera = seiteNachladen(() => import('./pages/Kamera'));
const Configuration = seiteNachladen(() => import('./pages/Configuration'));
const ConfigurationProduct = seiteNachladen(() => import('./pages/ConfigurationProduct'));
const Shop = seiteNachladen(() => import('./pages/Shop'));
const ShopPricing = seiteNachladen(() => import('./pages/ShopPricing'));
const CrmPricing = seiteNachladen(() => import('./pages/CrmPricing'));
const Plans = seiteNachladen(() => import('./pages/Plans'));
const DemoShop = seiteNachladen(() => import('./pages/DemoShop'));
const ConfigurationOrders = seiteNachladen(() => import('./pages/ConfigurationOrders'));
const ConfigurationFaq = seiteNachladen(() => import('./pages/ConfigurationFaq'));
const Settings = seiteNachladen(() => import('./pages/Settings'));
const PrivacyPolicy = seiteNachladen(() => import('./pages/PrivacyPolicy'));
const LegalSupport = seiteNachladen(() => import('./pages/LegalSupport'));
import { I18nProvider } from './lib/i18n';
import { ParkProvider } from './contexts/ParkContext';
import KioskAwareOverlay from './components/KioskAwareOverlay';
import GuestActivityAwareOverlay from './components/GuestActivityAwareOverlay';
import OwnerOnly from './components/OwnerOnly';
import PlanGate from './components/upgrade/PlanGate';
import CameraAvailableOnly from './components/CameraAvailableOnly';
const Team = seiteNachladen(() => import('./pages/Team'));

function AppShellMetaController() {
  const location = useLocation();

  useEffect(() => {
    document.title = 'Liftpictures Operator Dashboard';
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
              <Route path="/demo-shop/:token" element={<DemoShop />} />
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
                      <GuestActivityAwareOverlay>
                        <Users />
                      </GuestActivityAwareOverlay>
                    </OwnerOnly>
                  }
                />
                <Route path="/photos" element={<Photos />} />
                <Route path="/configuration" element={<Configuration />} />
                <Route path="/configuration/produkt/:id" element={<ConfigurationProduct />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/shop/preise" element={<ShopPricing />} />
                <Route path="/shop/bearbeiten" element={<Shop />} />
                <Route path="/configuration/bestellungen" element={<ConfigurationOrders />} />
                <Route path="/configuration/faq" element={<ConfigurationFaq />} />
                <Route path="/plaene" element={<OwnerOnly><Plans /></OwnerOnly>} />
                <Route path="/leads/preise" element={<OwnerOnly><CrmPricing /></OwnerOnly>} />
                {/* Die CRM-Reiter sind eigene Seiten (CRM_TABS in survey/UnlockCenter.tsx).
                    Bewusst EINE Route mit `*` statt je Reiter eine: so bleibt die Seite
                    beim Wechsel geladen und holt die Kontakte nicht jedes Mal neu.
                    `/leads/preise` steht darüber und gewinnt als genauerer Pfad. */}
                <Route path="/leads/*" element={<OwnerOnly><PlanGate><Leads /></PlanGate></OwnerOnly>} />
                <Route path="/personalization" element={<Personalization />} />
                <Route path="/tickets" element={<Support />} />
                <Route path="/health" element={<SystemHealth />} />
                <Route path="/kamera" element={<CameraAvailableOnly><Kamera /></CameraAvailableOnly>} />
                <Route path="/ratgeber" element={<Ratgeber />} />
                <Route path="/ratgeber/:slug" element={<RatgeberArticle />} />
                <Route path="/team" element={<OwnerOnly><Team /></OwnerOnly>} />
                <Route path="/settings" element={<OwnerOnly><Settings /></OwnerOnly>} />
              </Route>

              {/* Früherer Staff-Bereich: wohnt jetzt im Liftpictures-CRM. */}
              <Route path="/staff/*" element={<Navigate to="/login" replace />} />
            </Routes>
            </Suspense>
            </NachladeGrenze>
          </ParkProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
