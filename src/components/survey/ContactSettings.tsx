import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { saveContactSettings, type FieldLevel } from '../../lib/surveyApi';
import { useI18n } from '../../lib/i18n';

const LEVELS: { value: FieldLevel; label: string }[] = [
  { value: 'required', label: 'social.level_required' },
  { value: 'optional', label: 'social.level_optional' },
  { value: 'off', label: 'social.level_off' },
];

function Choice({ label, value, onChange }: { label: string; value: FieldLevel; onChange: (v: FieldLevel) => void }) {
  const { t } = useI18n();
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-600">{label}</p>
      <div className="inline-flex rounded-xl bg-white/60 p-1">
        {LEVELS.map((l) => (
          <button
            key={l.value}
            type="button"
            onClick={() => onChange(l.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              value === l.value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t(l.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Welche Kontaktdaten Gäste beim Freischalten angeben (E-Mail-Modus und Social-Modus). */
export default function ContactSettings({ parkId, email, phone, address, onSaved }: {
  parkId: string;
  email: FieldLevel;
  phone: FieldLevel;
  address: FieldLevel;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [emailMode, setEmailMode] = useState<FieldLevel>(email);
  const [phoneMode, setPhoneMode] = useState<FieldLevel>(phone);
  const [addressMode, setAddressMode] = useState<FieldLevel>(address);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setEmailMode(email); setPhoneMode(phone); setAddressMode(address); }, [email, phone, address]);

  const dirty = emailMode !== email || phoneMode !== phone || addressMode !== address;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveContactSettings(parkId, emailMode, phoneMode, addressMode);
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('survey.save_failed'));
    }
    setSaving(false);
  }

  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="flex flex-wrap items-end gap-6">
        <Choice label={t('contact.email')} value={emailMode} onChange={(v) => { setEmailMode(v); setSaved(false); }} />
        <Choice label={t('contact.phone')} value={phoneMode} onChange={(v) => { setPhoneMode(v); setSaved(false); }} />
        <Choice label={t('contact.address')} value={addressMode} onChange={(v) => { setAddressMode(v); setSaved(false); }} />
        <button type="button" onClick={save} disabled={saving || !dirty} className="glass-button-primary disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('survey.save')}
        </button>
        {saved && !dirty && (
          <span className="flex items-center gap-1 text-sm text-emerald-700">
            <Check className="h-4 w-4" /> {t('contact.applies_now')}
          </span>
        )}
      </div>
      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </GlassCard>
  );
}
