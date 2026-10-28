import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePark } from '../contexts/ParkContext';
import { supabase } from '../lib/supabase';
import ParkLookupField, { type ParkChoice } from '../components/auth/ParkLookupField';
import { useI18n } from '../lib/i18n';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import Footer from '../components/layout/Footer';
import LanguagePicker from '../components/layout/LanguagePicker';
import { authErrorKey } from '../lib/authErrors';

export default function Register() {
  const { user, loading, signUp, refreshProfile } = useAuth();
  const { t } = useI18n();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Beim Erstellen gleich mit dem Park verbinden (einmalig Park-Passwort), danach reichen E-Mail und Passwort.
  const { setPark } = usePark();
  const navigate = useNavigate();
  const [park, setParkChoice] = useState<ParkChoice | null>(null);
  const [parkPassword, setParkPassword] = useState('');

  if (loading) return null;
  if (user && !submitting) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError(t('auth.err_password_short'));
      return;
    }
    if (!park) {
      setError(t('auth.park_error_pick'));
      return;
    }
    if (!parkPassword) {
      setError(t('auth.park_error_missing'));
      return;
    }
    setSubmitting(true);
    const { error } = await signUp(email, password, fullName);
    if (error) {
      setError(t(authErrorKey(error)));
      setSubmitting(false);
      return;
    }
    // Ohne Sitzung (E-Mail muss erst bestätigt werden) verbindet man den Park bei der ersten Anmeldung.
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: ok } = await supabase.rpc('link_park_access', { p_park_id: park.id, p_password: parkPassword });
      if (ok) {
        // Beim Verbinden bekommt das neue Konto seine Organisation: Sitzung und Profil neu laden.
        await supabase.auth.refreshSession().catch(() => undefined);
        await refreshProfile();
        setPark(park.id, park.name);
        navigate('/', { replace: true });
        return;
      }
      // Konto ist angelegt, aber das Park-Passwort stimmte nicht: auf der Anmeldeseite (Park schon gewählt) erneut verbinden.
      try { localStorage.setItem('lp-last-park', JSON.stringify(park)); } catch { /* Park dort neu tippen */ }
      navigate('/login', { replace: true });
      return;
    }
    setSubmitting(false);
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div
        className="relative flex flex-1 items-center justify-center p-4"
        style={{
          backgroundImage:
            "url('https://xcrxltiiovpoladpaewd.supabase.co/storage/v1/object/public/test/Copy%20of%20Copy%20of%20Photo-%20und%20Videosystems%20since%202006.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-[1px]" />
        <LanguagePicker className="absolute right-4 top-4 z-10" />
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
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">{t('auth.create_account')}</h1>
              <p className="mt-1 text-sm text-slate-500">Liftbase · {t('brand.tagline')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="animate-fade-in rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('auth.full_name')}</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('demoreq.name')}
                  required
                  className="glass-input"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('auth.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.email_placeholder')}
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

              <div className="border-t border-slate-200 pt-4">
                <p className="mb-3 text-xs text-slate-500">{t('auth.register_park_hint')}</p>
                <ParkLookupField selected={park} onSelect={setParkChoice} />
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
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('auth.create_account')}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              {t('auth.have_account')}{' '}
              <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
                {t('auth.sign_in')}
              </Link>
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Liftbase
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
