import { LEAD_SOURCE_TABLE_LABELS, LEAD_SOURCE_TABLE_SHORT_LABELS, type ContactEvent } from '../lib/leads';

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date);
}

interface ContactTimelineProps {
  events: ContactEvent[];
  onDelete: (id: string) => Promise<void>;
}

// Expects `events` already filtered to one email and sorted ascending by date.
export default function ContactTimeline({ events, onDelete }: ContactTimelineProps) {
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
          .map((event) => (
            <div key={event.id} className="contact-timeline-item" title={LEAD_SOURCE_TABLE_LABELS[event.source_table]}>
              <span>{formatShortDate(event.contacted_at)}</span>
              <span className="lead-lang-badge">{LEAD_SOURCE_TABLE_SHORT_LABELS[event.source_table]}</span>
              <button type="button" className="contact-timeline-remove" onClick={() => handleDelete(event.id)}>
                ×
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
