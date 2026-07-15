import { Camera, Monitor, Mountain } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import CamerasPage from './CamerasPage';
import LiftpicSetupPage from './LiftpicSetupPage';
import ParksPage from './ParksPage';

type CustomerManagementTab = 'parks' | 'cameras' | 'liftpic';

const tabs = [
  {
    id: 'parks',
    label: 'Kunden & Parks',
    description: 'Parks, Attraktionen und Foto-Kuerzel',
    icon: Mountain,
  },
  {
    id: 'cameras',
    label: 'Kameras',
    description: 'Kamera-Codes und Bildvorschau',
    icon: Camera,
  },
  {
    id: 'liftpic',
    label: 'Liftpic PCs',
    description: 'Uploader, Modus, Pairing und Health',
    icon: Monitor,
  },
] as const;

function normalizeTab(value: string | null): CustomerManagementTab {
  return tabs.some((tab) => tab.id === value) ? (value as CustomerManagementTab) : 'parks';
}

export default function CustomerManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = normalizeTab(searchParams.get('tab'));
  const activeMeta = useMemo(() => tabs.find((tab) => tab.id === activeTab) || tabs[0], [activeTab]);

  function selectTab(tab: CustomerManagementTab) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }

  return (
    <div className="customer-management-page">
      <div className="card customer-management-hero">
        <div>
          <p className="eyebrow">Setup & Betrieb</p>
          <h2>Kunden Management</h2>
          <p className="note">
            Ein Ort fuer alles, was zu einem Kunden gehoert: Park anlegen, Attraktionen pflegen, Kameras zuordnen
            und den neuen Liftpic Sync pro Attraktions-PC steuern.
          </p>
        </div>
      </div>

      <div className="customer-management-tabs" role="tablist" aria-label="Kunden Management Bereiche">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`customer-management-tab ${isActive ? 'active' : ''}`}
              onClick={() => selectTab(tab.id)}
            >
              <tab.icon size={18} />
              <span>
                <strong>{tab.label}</strong>
                <small>{tab.description}</small>
              </span>
            </button>
          );
        })}
      </div>

      <div className="management-section" aria-label={activeMeta.label}>
        {activeTab === 'parks' && <ParksPage />}
        {activeTab === 'cameras' && <CamerasPage />}
        {activeTab === 'liftpic' && <LiftpicSetupPage />}
      </div>
    </div>
  );
}
