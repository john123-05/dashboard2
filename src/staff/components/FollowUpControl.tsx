import { useState } from 'react';
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

  if (expanded) {
    return (
      <div className="follow-up-control follow-up-editing">
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
          placeholder="Notiz (optional)"
        />
        <div className="follow-up-actions">
          <button type="button" onClick={handleSave} disabled={saving || !dateInput}>
            {saving ? '...' : 'Speichern'}
          </button>
          <button type="button" className="secondary inline" onClick={() => setExpanded(false)}>
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  if (!followUp) {
    return (
      <button type="button" className="follow-up-set-btn" onClick={openEditor}>
        Follow-up setzen
      </button>
    );
  }

  const urgency = followUpUrgency(followUp.next_due_at);
  return (
    <div className="follow-up-control">
      <span className={`follow-up-badge follow-up-${urgency}`}>
        {URGENCY_LABELS[urgency]} · {formatFollowUpDate(followUp.next_due_at)}
        {followUp.cadence_days ? ` (alle ${followUp.cadence_days}T.)` : ''}
      </span>
      {followUp.note && <span className="follow-up-note-preview">{followUp.note}</span>}
      <div className="follow-up-actions">
        <button type="button" className="secondary inline" onClick={handleDone} disabled={saving}>
          {saving ? '...' : 'Erledigt'}
        </button>
        <button type="button" className="secondary inline" onClick={openEditor}>
          Ändern
        </button>
      </div>
    </div>
  );
}
