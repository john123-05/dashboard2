import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../lib/i18n';
import { usePark } from '../contexts/ParkContext';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import { supabase } from '../lib/supabase';
import { Loader2, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const { user, loading, signIn } = useAuth();
  const { t } = useI18n();
  const { parkId: activeParkId, setPark } = usePark();
  const [parks, setParks] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [parkId, setParkId] = useState('');
  const [parkPassword, setParkPassword] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await invokeEdgeFunction('external-parks');
      if (!error && !cancelled) {
        const loadedParks = data?.parks || [];
        setParks(loadedParks);
        if (loadedParks.length > 0) {
          setParkId((prev) => prev || loadedParks[0].id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="mesh-gradient flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }
  if (user && activeParkId) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    if (!user) {
      const { error } = await signIn(email, password);
      if (error) {
        setError(error);
        setSubmitting(false);
        return;
      }
    }

    if (!parkId || !parkPassword) {
      setError(t('auth.park_error_missing'));
      setSubmitting(false);
      return;
    }

    const { data: ok, error: parkError } = await supabase.rpc('verify_park_access', {
      p_park_id: parkId,
      p_password: parkPassword,
    });

    if (parkError || !ok) {
      setError(t('auth.park_error_invalid'));
      setSubmitting(false);
      return;
    }

    const selected = parks.find((p) => p.id === parkId);
    setPark(parkId, selected?.name || null);
    setSubmitting(false);
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center p-4"
      style={{
        backgroundImage:
          "url('https://xcrxltiiovpoladpaewd.supabase.co/storage/v1/object/public/test/Copy%20of%20Copy%20of%20Photo-%20und%20Videosystems%20since%202006.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-[1px]" />
      <div className="relative w-full max-w-md">
        <div className="glass-panel-strong animate-slide-up rounded-3xl p-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
              <img
                src="https://xcrxltiiovpoladpaewd.supabase.co/storage/v1/object/public/test/Liftpicutures%20Logo%20alt.jpg"
                alt="Liftpictures"
                className="h-16 w-16 rounded-2xl object-cover"
                loading="lazy"
              />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">{t('auth.welcome')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('nav.operator_dashboard')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="animate-fade-in rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            {!user && (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('auth.email')}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    className="glass-input"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('auth.password')}</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('auth.password')}
                      required
                      className="glass-input pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('auth.park')}</label>
              <select
                value={parkId}
                onChange={(e) => setParkId(e.target.value)}
                className="glass-input"
                required
              >
                {parks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('auth.park_password')}</label>
              <input
                type="password"
                value={parkPassword}
                onChange={(e) => setParkPassword(e.target.value)}
                placeholder={t('auth.park_password_placeholder')}
                required
                className="glass-input"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="glass-button-primary mt-2 w-full py-3"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('auth.sign_in')}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {t('auth.new_operator')}{' '}
            <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">
              {t('auth.create_account')}
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Liftpictures Operator Dashboard
        </p>
      </div>
    </div>
  );
}
