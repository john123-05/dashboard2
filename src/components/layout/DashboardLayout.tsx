import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Sidebar from './Sidebar';
import { Loader2, Mountain, ArrowRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { usePark } from '../../contexts/ParkContext';

export default function DashboardLayout() {
  const { user, loading, hasOrg, joinDemoOrg } = useAuth();
  const { t } = useI18n();
  const { parkId } = usePark();
  const [joining, setJoining] = useState(false);

  if (loading) {
    return (
      <div className="mesh-gradient flex min-h-screen items-center justify-center">
        <div className="glass-panel animate-fade-in flex flex-col items-center gap-4 rounded-2xl px-8 py-10">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-slate-500">{t('dashboard.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!hasOrg) {
    return (
      <div className="mesh-gradient flex min-h-screen items-center justify-center p-4">
        <div className="glass-panel-strong animate-slide-up w-full max-w-md rounded-3xl p-8 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100">
            <Mountain className="h-8 w-8 text-brand-600" />
          </div>
          <h2 className="mb-2 text-xl font-bold text-slate-800">{t('dashboard.join_title')}</h2>
          <p className="mb-8 text-sm leading-relaxed text-slate-500">
            {t('dashboard.join_desc')}
          </p>
          <button
            onClick={async () => {
              setJoining(true);
              await joinDemoOrg();
              setJoining(false);
            }}
            disabled={joining}
            className="glass-button-primary w-full"
          >
            {joining ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {t('dashboard.join_button')}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (user && !parkId) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="mesh-gradient flex min-h-screen overflow-x-hidden">
      <Sidebar />
      <main className="flex-1 pl-64 transition-all duration-300 overflow-x-hidden">
        <div className="min-h-screen p-6 lg:p-8 w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
