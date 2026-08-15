import { useState } from 'react';
import { BellRing, Check, Pencil, X } from 'lucide-react';
import { followUpUrgency, formatFollowUpDate, nextFollowUpAfterCompletion, type LeadFollowUp } from '../lib/leads';

interface FollowUpControlProps {
  followUp: LeadFollowUp | null;
  onSet: (nextDueAt: string, cadenceDays: number | null, note: string) => Promise<void>;
  onClear: (id: string) => Promise<void>;
}

const URGENCY_LABELS: Record<string, string> = {
  overdue: 'Überfällig',
  today: 'Heute fällig',
  soon: 'Bald fällig',
  later: 'Follow-up',
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function futureIsoDate(days: number): string {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

export default function FollowUpControl({ followUp, onSet, onClear }: FollowUpControlProps) {
  const [expanded, setExpanded] = useState(false);
  const [dateInput, setDateInput] = useState(followUp?.next_due_at ?? todayIsoDate());
  const [cadence, setCadence] = useState(followUp?.cadence_days ? String(followUp.cadence_days) : '');
  const [note, setNote] = useState(followUp?.note ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!dateInput) return;
    setSaving(true);
    try {
      await onSet(dateInput, cadence ? Number(cadence) : null, note.trim());
      setExpanded(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDone() {
    if (!followUp) return;
    setSaving(true);
    try {
      const rescheduled = nextFollowUpAfterCompletion(followUp);
      if (rescheduled) {
        await onSet(rescheduled.next_due_at, rescheduled.cadence_days, rescheduled.note);
      } else {
        await onClear(followUp.id);
      }
    } finally {
      setSaving(false);
    }
  }

  function openEditor() {
    setDateInput(followUp?.next_due_at ?? todayIsoDate());
    setCadence(followUp?.cadence_days ? String(followUp.cadence_days) : '');
    setNote(followUp?.note ?? '');
    setExpanded(true);
  }

  function applyPreset(days: number, repeatDays?: number | null) {
    setDateInput(futureIsoDate(days));
    setCadence(repeatDays ? String(repeatDays) : '');
  }

  if (expanded) {
    return (
      <div className="follow-up-control follow-up-editing is-expanded">
        <div className="follow-up-editing-head">
          <div className="follow-up-editing-title">
            <BellRing size={14} />
            <span>Follow-up</span>
          </div>
          <button
            type="button"
            className="follow-up-editing-close"
            onClick={() => setExpanded(false)}
            aria-label="Follow-up schließen"
            title="Schließen"
          >
            <X size={12} />
          </button>
        </div>

        <div className="follow-up-preset-row">
          <button type="button" className="follow-up-preset-btn" onClick={() => applyPreset(0)}>
            Heute
          </button>
          <button type="button" className="follow-up-preset-btn" onClick={() => applyPreset(1)}>
            Morgen
          </button>
          <button type="button" className="follow-up-preset-btn" onClick={() => applyPreset(7, 7)}>
            7 Tage
          </button>
          <button type="button" className="follow-up-preset-btn" onClick={() => applyPreset(14, 14)}>
            14 Tage
          </button>
        </div>

        <div className="follow-up-field-grid">
          <input type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
          <select value={cadence} onChange={(e) => setCadence(e.target.value)}>
            <option value="">Keine Wiederholung</option>
            <option value="7">Alle 7 Tage</option>
            <option value="14">Alle 14 Tage</option>
            <option value="30">Alle 30 Tage</option>
          </select>
          <input
            type="text"
            className="follow-up-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Notiz"
          />
        </div>

        <div className="follow-up-actions follow-up-actions-editor">
          <button type="button" className="follow-up-save-btn" onClick={handleSave} disabled={saving || !dateInput}>
            {saving ? '...' : 'Speichern'}
          </button>
          <button type="button" className="follow-up-cancel-btn" onClick={() => setExpanded(false)}>
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  if (!followUp) {
    return (
      <button type="button" className="follow-up-set-btn" onClick={openEditor} title="Follow-up neu" aria-label="Follow-up neu">
        <BellRing size={14} />
      </button>
    );
  }

  const urgency = followUpUrgency(followUp.next_due_at);
  return (
    <div className="follow-up-control is-collapsed">
      <div className="follow-up-compact-row">
        <span className={`follow-up-badge follow-up-${urgency}`}>
          {URGENCY_LABELS[urgency]} · {formatFollowUpDate(followUp.next_due_at)}
          {followUp.cadence_days ? ` · ${followUp.cadence_days}T` : ''}
        </span>
      </div>
      {followUp.note && <span className="follow-up-note-preview">{followUp.note}</span>}
      <div className="follow-up-actions">
        <button
          type="button"
          className="secondary inline"
          onClick={handleDone}
          disabled={saving}
          title="Erledigt"
          aria-label="Erledigt"
        >
          {saving ? '...' : <Check size={13} />}
        </button>
        <button
          type="button"
          className="secondary inline"
          onClick={openEditor}
          title="Bearbeiten"
          aria-label="Bearbeiten"
        >
          <Pencil size={12} />
        </button>
      </div>
    </div>
  );
}
