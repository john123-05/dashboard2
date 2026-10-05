import { Check } from 'lucide-react';
import type { Bestellstatus } from '../../lib/equipment';

const STAGES: { key: Bestellstatus; label: string }[] = [
  { key: 'bestellung_erhalten', label: 'Bestellung erhalten' },
  { key: 'in_bearbeitung', label: 'Wird bearbeitet' },
  { key: 'versendet', label: 'Versendet' },
  { key: 'installiert', label: 'Installiert' },
];

/** Amazon-artige Fortschrittsanzeige fuer eine Ausstattungs-Bestellung. */
export default function OrderStatusStepper({ status }: { status: Bestellstatus }) {
  const currentIndex = Math.max(
    0,
    STAGES.findIndex((s) => s.key === status),
  );

  return (
    <div className="flex items-start">
      {STAGES.map((stage, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={stage.key} className="flex flex-1 items-start last:flex-none">
            <div className="flex w-16 flex-col items-center gap-1.5 sm:w-20">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-200 text-slate-400'
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={`text-center text-[11px] leading-tight ${
                  active ? 'font-semibold text-slate-800' : done ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                {stage.label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div className={`mt-3.5 h-0.5 flex-1 ${i < currentIndex ? 'bg-emerald-500' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
