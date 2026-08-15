import { useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ContactQuickAddProps {
  onAdd: (contactedAtIso: string, note: string, files: File[]) => Promise<void>;
}

export default function ContactQuickAdd({ onAdd }: ContactQuickAddProps) {
  const [dateInput, setDateInput] = useState(todayIsoDate());
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleAdd() {
    if (!dateInput) return;
    setAdding(true);
    try {
      await onAdd(new Date(`${dateInput}T12:00:00`).toISOString(), note.trim(), files);
      setNote('');
      setFiles([]);
      setExpanded(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className={`contact-quick-add ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
      {!expanded ? (
        <button type="button" className="contact-quick-add-compact-btn" onClick={() => setExpanded(true)}>
          Kontaktiert
        </button>
      ) : (
        <div className="contact-quick-add-details">
          <div className="contact-quick-add-row">
            <input type="date" value={dateInput} max={todayIsoDate()} onChange={(e) => setDateInput(e.target.value)} />
            <button type="button" className="secondary inline" onClick={handleAdd} disabled={adding || !dateInput}>
              {adding ? '...' : 'Speichern'}
            </button>
            <button type="button" className="secondary inline" onClick={() => setExpanded(false)} disabled={adding}>
              Abbrechen
            </button>
          </div>

          <textarea
            className="contact-quick-add-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Notiz"
            rows={2}
          />

          <div className="contact-quick-add-files">
            <button type="button" className="contact-quick-add-toggle" onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={12} />
              Datei
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              style={{ display: 'none' }}
            />
            {files.length > 0 && <span className="note">{files.length} Datei(en)</span>}
          </div>
        </div>
      )}
    </div>
  );
}
