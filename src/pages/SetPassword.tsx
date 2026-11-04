// Seite „Passwort festlegen“: Ziel des Einladungs-/Passwort-Links, den wir für neue Kunden erzeugen
// (Supabase recovery link, ohne dass Supabase eine Mail verschickt). Der Link meldet den Kunden an
// (Token im Adress-Anker, supabase-js liest ihn selbst), hier wählt er sein Passwort und landet in
// „Erste Schritte“. Ohne gültige Sitzung: Hinweis, dass der Link abgelaufen ist.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import LanguagePicker from '../components/layout/LanguagePicker';

const BG = "url('https://xcrxltiiovpoladpaewd.supabase.co/storage/v1/object/public/test/Copy%20of%20Copy%20of%20Photo-%20und%20Videosystems%20since%202006.jpg')";

export default function SetPassword() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    // Kurz warten: supabase-js verarbeitet den Token aus dem Link asynchron.
    const read = () => supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setEmail(data.session?.user.email ?? null);
      setChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user.email && alive) { setEmail(session.user.email); setChecked(true); }
    });
    const timer = window.setTimeout(read, 600);
    return () => { alive = false; window.clearTimeout(timer); sub.subscription.unsubscribe(); };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (pw.length < 8) { setError(t('setpw.too_short')); return; }
    if (pw !== pw2) { setError(t('setpw.mismatch')); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (err) { setError(t('setpw.failed')); return; }
    navigate('/start', { replace: true });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4" style={{ backgroundImage: BG, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-[1px]" />
      <LanguagePicker className="absolute right-4 top-4 z-10" />
      <div className="relative w-full max-w-md">
        <div className="glass-panel-strong animate-slide-up rounded-3xl p-6 sm:p-8">
          {!checked ? (
            <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
          ) : !email ? (
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">{t('setpw.expired_title')}</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{t('setpw.expired_text')}</p>
              <a href="/login" className="glass-button-primary mt-6 w-full justify-center py-3">{t('setpw.to_login')}</a>
            </div>
          ) : (
            <form onSubmit={save} noValidate>
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">{t('setpw.title')}</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{t('setpw.intro')}</p>
              <p className="mt-4 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-700">{email}</p>
              {error && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
              <label htmlFor="setpw-1" className="mb-1.5 mt-4 block text-sm font-medium text-slate-700">{t('setpw.new')}</label>
              <div className="relative">
                <input id="setpw-1" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="glass-input pr-11" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={show ? t('setpw.hide') : t('setpw.show')}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <label htmlFor="setpw-2" className="mb-1.5 mt-4 block text-sm font-medium text-slate-700">{t('setpw.repeat')}</label>
              <input id="setpw-2" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="glass-input" />
              <p className="mt-2 text-xs text-slate-500">{t('setpw.hint')}</p>
              <button type="submit" disabled={busy} className="glass-button-primary mt-6 w-full py-3">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('setpw.save')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
