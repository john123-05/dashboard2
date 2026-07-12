import { useState } from 'react';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ContactQuickAddProps {
  onAdd: (contactedAtIso: string) => Promise<void>;
}

export default function ContactQuickAdd({ onAdd }: ContactQuickAddProps) {
  const [dateInput, setDateInput] = useState(todayIsoDate());
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!dateInput) return;
    setAdding(true);
    try {
      await onAdd(new Date(`${dateInput}T12:00:00`).toISOString());
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="contact-quick-add">
      <input type="date" value={dateInput} max={todayIsoDate()} onChange={(e) => setDateInput(e.target.value)} />
      <button type="button" className="secondary inline" onClick={handleAdd} disabled={adding || !dateInput}>
        {adding ? '...' : '+ Kontakt'}
      </button>
    </div>
  );
}
