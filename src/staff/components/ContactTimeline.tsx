import { FileText } from 'lucide-react';
import {
  attachmentsForEvent,
  LEAD_SOURCE_TABLE_LABELS,
  LEAD_SOURCE_TABLE_SHORT_LABELS,
  type ContactAttachment,
  type ContactEvent,
} from '../lib/leads';

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date);
}

interface ContactTimelineProps {
  events: ContactEvent[];
  attachments: ContactAttachment[];
  onDelete: (id: string) => Promise<void>;
  onDeleteAttachment: (id: string) => Promise<void>;
}

// Expects `events` already filtered to one email and sorted ascending by date.
export default function ContactTimeline({ events, attachments, onDelete, onDeleteAttachment }: ContactTimelineProps) {
  if (events.length === 0) return null;

  const dots =
    events.length === 1
      ? [{ event: events[0], pct: 50 }]
      : (() => {
          const times = events.map((e) => new Date(e.contacted_at).getTime());
          const min = Math.min(...times);
          const max = Math.max(...times);
          const range = max - min || 1;
          return events.map((event) => ({
            event,
            pct: ((new Date(event.contacted_at).getTime() - min) / range) * 100,
          }));
        })();

  async function handleDelete(id: string) {
    if (!window.confirm('Diesen Kontakt-Eintrag wirklich löschen?')) return;
    await onDelete(id);
  }

  async function handleDeleteAttachment(id: string) {
    if (!window.confirm('Diese Datei wirklich löschen?')) return;
    await onDeleteAttachment(id);
  }

  return (
    <div className="contact-timeline">
      <div className="contact-timeline-track">
        {dots.map(({ event, pct }) => (
          <div
            key={event.id}
            className="contact-timeline-dot"
            style={{ left: `${pct}%` }}
            title={`${formatShortDate(event.contacted_at)} · ${LEAD_SOURCE_TABLE_LABELS[event.source_table]}`}
          />
        ))}
      </div>
      <div className="contact-timeline-list">
        {events
          .slice()
          .reverse()
          .map((event) => {
            const ownAttachments = attachmentsForEvent(attachments, event.id);
            return (
              <div key={event.id} className="contact-timeline-entry">
                <div className="contact-timeline-item" title={LEAD_SOURCE_TABLE_LABELS[event.source_table]}>
                  <span>{formatShortDate(event.contacted_at)}</span>
                  <span className="lead-lang-badge">{LEAD_SOURCE_TABLE_SHORT_LABELS[event.source_table]}</span>
                  <button type="button" className="contact-timeline-remove" onClick={() => handleDelete(event.id)}>
                    ×
                  </button>
                </div>
                {event.note && <p className="contact-timeline-note">{event.note}</p>}
                {ownAttachments.length > 0 && (
                  <div className="contact-timeline-attachments">
                    {ownAttachments.map((attachment) => {
                      const isImage = attachment.mime_type?.startsWith('image/');
                      return (
                        <div key={attachment.id} className="contact-attachment-chip" title={attachment.file_name}>
                          <a href={attachment.url ?? '#'} target="_blank" rel="noreferrer">
                            {isImage && attachment.url ? (
                              <img src={attachment.url} alt={attachment.file_name} />
                            ) : (
                              <span className="contact-attachment-icon">
                                <FileText size={16} />
                              </span>
                            )}
                          </a>
                          <button
                            type="button"
                            className="contact-attachment-remove"
                            onClick={() => handleDeleteAttachment(attachment.id)}
                            title="Datei löschen"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
