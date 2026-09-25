import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { saveContactSettings, type FieldLevel } from '../../lib/surveyApi';

const LEVELS: { value: FieldLevel; label: string }[] = [
  { value: 'required', label: 'Pflicht' },
  { value: 'optional', label: 'Freiwillig' },
  { value: 'off', label: 'Aus' },
];

function Choice({ label, value, onChange }: { label: string; value: FieldLevel; onChange: (v: FieldLevel) => void }) {
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
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Welche Kontaktdaten Gäste beim Freischalten angeben (E-Mail-Modus und Social-Modus). */
export default function ContactSettings({ parkId, email, phone, onSaved }: {
  parkId: string;
  email: FieldLevel;
  phone: FieldLevel;
  onSaved: () => void;
}) {
  const [emailMode, setEmailMode] = useState<FieldLevel>(email);
  const [phoneMode, setPhoneMode] = useState<FieldLevel>(phone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setEmailMode(email); setPhoneMode(phone); }, [email, phone]);

  const dirty = emailMode !== email || phoneMode !== phone;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveContactSettings(parkId, emailMode, phoneMode);
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    }
    setSaving(false);
  }

  return (
    <GlassCard className="p-5 sm:p-6">
      <h3 className="text-base font-semibold text-slate-800">Was Gäste angeben</h3>
      <p className="mt-0.5 text-sm text-slate-500">
        Name ist immer dabei. Mit „Freiwillig“ können Gäste das Feld überspringen.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-6">
        <Choice label="E-Mail-Adresse" value={emailMode} onChange={(v) => { setEmailMode(v); setSaved(false); }} />
        <Choice label="Telefonnummer" value={phoneMode} onChange={(v) => { setPhoneMode(v); setSaved(false); }} />
        <button type="button" onClick={save} disabled={saving || !dirty} className="glass-button-primary disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Speichern
        </button>
        {saved && !dirty && (
          <span className="flex items-center gap-1 text-sm text-emerald-700">
            <Check className="h-4 w-4" /> Gilt sofort
          </span>
        )}
      </div>
      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </GlassCard>
  );
}
