import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../lib/i18n';
import { usePark } from '../contexts/ParkContext';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import { supabase, EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '../lib/supabase';
import { ArrowLeft, ArrowRight, CalendarCheck, ExternalLink, Loader2, Eye, EyeOff } from 'lucide-react';
import Footer from '../components/layout/Footer';

// Termin für die Demo (Videokonferenz) – Calendly von Liftpictures.
const CALENDLY_URL = 'https://calendly.com/kontakt-liftpictures-fotosysteme/30min';

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
  // „Demo buchen“: statt der Anmeldung erst ein kurzes Formular, dann die Terminwahl bei Calendly.
  const [mode, setMode] = useState<'login' | 'demo' | 'calendar'>('login');
  const [demo, setDemo] = useState({ name: '', email: '', company: '', phone: '', website: '' });
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState('');

  async function submitDemo(e: React.FormEvent) {
    e.preventDefault();
    setDemoError('');
    if (!demo.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(demo.email.trim())) {
      setDemoError(t('demoreq.error'));
      return;
    }
    setDemoBusy(true);
    try {
      // Die Anfrage landet im CRM. Scheitert das Speichern, soll die Terminwahl trotzdem möglich sein.
      await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/demo-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EXTERNAL_SUPABASE_ANON_KEY },
        body: JSON.stringify(demo),
      });
    } catch {
      // weiter zur Terminwahl
    }
    setDemoBusy(false);
    setMode('calendar');
  }

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
        <div className={`relative w-full ${mode === 'calendar' ? 'max-w-3xl' : 'max-w-md'}`}>
          <div className="glass-panel-strong animate-slide-up rounded-3xl p-6 sm:p-8">
            {mode === 'demo' && (
              <div>
                <button type="button" onClick={() => setMode('login')} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
                  <ArrowLeft className="h-4 w-4" /> {t('demoreq.back')}
                </button>
                <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-800">{t('demoreq.title')}</h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{t('demoreq.intro')}</p>
                <form onSubmit={submitDemo} className="mt-6 space-y-4" noValidate>
                  {demoError && <div className="animate-fade-in rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{demoError}</div>}
                  <div>
                    <label htmlFor="demo-name" className="mb-1.5 block text-sm font-medium text-slate-700">{t('demoreq.name')}</label>
                    <input id="demo-name" autoComplete="name" value={demo.name} onChange={(e) => setDemo({ ...demo, name: e.target.value })} required className="glass-input" />
                  </div>
                  <div>
                    <label htmlFor="demo-email" className="mb-1.5 block text-sm font-medium text-slate-700">{t('demoreq.email')}</label>
                    <input id="demo-email" type="email" autoComplete="email" value={demo.email} onChange={(e) => setDemo({ ...demo, email: e.target.value })} required className="glass-input" />
                  </div>
                  <div>
                    <label htmlFor="demo-company" className="mb-1.5 block text-sm font-medium text-slate-700">{t('demoreq.company')}</label>
                    <input id="demo-company" autoComplete="organization" value={demo.company} onChange={(e) => setDemo({ ...demo, company: e.target.value })} className="glass-input" />
                  </div>
                  <div>
                    <label htmlFor="demo-phone" className="mb-1.5 block text-sm font-medium text-slate-700">{t('demoreq.phone')}</label>
                    <input id="demo-phone" type="tel" autoComplete="tel" value={demo.phone} onChange={(e) => setDemo({ ...demo, phone: e.target.value })} className="glass-input" />
                  </div>
                  {/* Unsichtbares Feld gegen Bots: Menschen lassen es leer. */}
                  <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={demo.website} onChange={(e) => setDemo({ ...demo, website: e.target.value })} className="hidden" />
                  <button type="submit" disabled={demoBusy} className="glass-button-primary mt-2 w-full py-3">
                    {demoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{t('demoreq.next')} <ArrowRight className="h-4 w-4" /></>}
                  </button>
                  <p className="text-center text-xs text-slate-400">{t('demoreq.privacy')}</p>
                </form>
              </div>
            )}

            {mode === 'calendar' && (
              <div>
                <button type="button" onClick={() => setMode('login')} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
                  <ArrowLeft className="h-4 w-4" /> {t('demoreq.back')}
                </button>
                <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-800">{t('demoreq.cal_title')}</h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{t('demoreq.cal_text', { name: demo.name.trim().split(/\s+/)[0] || '' })}</p>
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <iframe
                    title={t('demoreq.cal_title')}
                    src={`${CALENDLY_URL}?hide_gdpr_banner=1&embed_type=Inline&embed_domain=${encodeURIComponent(window.location.hostname)}`}
                    className="h-[680px] w-full border-0"
                  />
                </div>
                <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
                  <ExternalLink className="h-4 w-4" /> {t('demoreq.open_new')}
                </a>
              </div>
            )}

            {mode === 'login' && (
            <>
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
              <p className="mt-1 text-sm text-slate-500">Liftbase · {t('brand.tagline')}</p>
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

            <div className="mt-6 border-t border-slate-200 pt-5 text-center">
              <p className="text-sm text-slate-500">{t('demoreq.cta_hint')}</p>
              <button type="button" onClick={() => setMode('demo')} className="glass-button-secondary mt-3 w-full justify-center py-2.5">
                <CalendarCheck className="h-4 w-4" /> {t('demoreq.cta')}
              </button>
            </div>
            </>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Liftbase · {t('brand.tagline')}
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
