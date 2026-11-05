// Einstellungen > Profil: eigenes Passwort ändern. Zur Sicherheit erst das aktuelle Passwort prüfen
// (falls jemand am offenen Rechner sitzt), dann das neue setzen. Gilt sofort für alle Geräte.
import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';

export default function ChangePasswordCard({ email }: { email: string | null | undefined }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!email) return;
    if (pw.length < 8) { setMsg({ ok: false, text: t('setpw.too_short') }); return; }
    if (pw !== pw2) { setMsg({ ok: false, text: t('setpw.mismatch') }); return; }
    if (pw === current) { setMsg({ ok: false, text: t('settings.pw.same') }); return; }
    setBusy(true);
    const check = await supabase.auth.signInWithPassword({ email, password: current });
    if (check.error) {
      setBusy(false);
      setMsg({ ok: false, text: t('settings.pw.wrong_current') });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      const weak = (error as { code?: string }).code === 'weak_password' || /weak|pwned|character/i.test(error.message);
      setMsg({ ok: false, text: `${weak ? t('setpw.weak') : t('setpw.failed')} (${error.message})` });
      return;
    }
    setCurrent(''); setPw(''); setPw2('');
    setMsg({ ok: true, text: t('settings.pw.done') });
  }

  const type = show ? 'text' : 'password';
  return (
    <GlassCard className="p-6">
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-800"><KeyRound className="h-4 w-4" />{t('settings.pw.title')}</h3>
      <p className="mb-4 text-sm text-slate-600">{t('settings.pw.intro')}</p>
      <form onSubmit={save} className="space-y-4" noValidate>
        <input type="email" autoComplete="username" value={email ?? ''} readOnly hidden />
        <div>
          <label htmlFor="pw-current" className="mb-1.5 block text-sm font-medium text-slate-700">{t('settings.pw.current')}</label>
          <div className="relative">
            <input id="pw-current" type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="glass-input pr-11" />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={show ? t('setpw.hide') : t('setpw.show')}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pw-new" className="mb-1.5 block text-sm font-medium text-slate-700">{t('setpw.new')}</label>
            <input id="pw-new" type={type} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="glass-input" />
          </div>
          <div>
            <label htmlFor="pw-new2" className="mb-1.5 block text-sm font-medium text-slate-700">{t('setpw.repeat')}</label>
            <input id="pw-new2" type={type} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="glass-input" />
          </div>
        </div>
        {msg && <div className={`rounded-xl px-4 py-3 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`} role="status">{msg.text}</div>}
        <button type="submit" disabled={busy || !current || !pw || !pw2} className="glass-button-primary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('settings.pw.save')}
        </button>
      </form>
    </GlassCard>
  );
}
