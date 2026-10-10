import type { ReactNode } from 'react';
import { Check, Minus, Send } from 'lucide-react';

// Price card for the upgrade pages (Speedmessung, Online-Shop, CRM). One look
// everywhere: white card, thin border, the recommended plan raised with a dark
// orange border and badge (Redesign Phase 3, docs/REDESIGN_PLAN.md).

type BadgeTone = 'brand' | 'positive' | 'neutral';

const BADGE_TONES: Record<BadgeTone, string> = {
  brand: 'bg-brand-600 text-white',
  positive: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  neutral: 'bg-slate-100 text-slate-600',
};

export function PlanAction({
  done,
  doneLabel,
  busy,
  disabled,
  label,
  busyLabel,
  onClick,
  highlight,
  compact,
}: {
  done: boolean;
  doneLabel: string;
  busy: boolean;
  disabled: boolean;
  label: string;
  busyLabel: string;
  onClick: () => void;
  highlight?: boolean;
  compact?: boolean;
}) {
  const size = compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm';
  if (done) {
    return (
      <div className={`mt-5 flex items-center justify-center gap-1.5 rounded-full bg-emerald-50 font-semibold text-emerald-700 ${size}`}>
        <Check className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        {doneLabel}
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`mt-5 inline-flex items-center justify-center gap-2 rounded-full font-semibold text-white transition-colors disabled:opacity-60 ${size} ${
        highlight ? 'bg-brand-600 hover:bg-brand-700' : 'bg-[color:var(--ink)] hover:bg-black'
      }`}
    >
      <Send className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      {busy ? busyLabel : label}
    </button>
  );
}

export default function PlanCard({
  badge,
  badgeTone = 'neutral',
  highlight,
  image,
  name,
  price,
  priceNote,
  includedLabel,
  points,
  excluded,
  compact,
  action,
}: {
  badge?: ReactNode;
  badgeTone?: BadgeTone;
  highlight?: boolean;
  image?: string;
  name: ReactNode;
  price: ReactNode;
  priceNote?: ReactNode;
  includedLabel: ReactNode;
  points: ReactNode[];
  /** Nicht enthalten (grau, mit Strich). */
  excluded?: ReactNode[];
  compact?: boolean;
  action: ReactNode;
}) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-xl bg-white transition-shadow ${
        highlight
          ? 'border-2 border-brand-600 shadow-[0_12px_32px_rgba(16,24,40,0.10)] lg:-translate-y-3'
          : 'border border-[color:var(--line)] hover:shadow-[0_4px_16px_rgba(16,24,40,0.06)]'
      }`}
    >
      {image && (
        <div className={`relative w-full shrink-0 overflow-hidden bg-slate-100 ${compact ? 'h-40' : 'h-44'}`}>
          <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
        </div>
      )}
      <div className={`flex flex-1 flex-col ${compact ? 'p-4' : 'p-6'}`}>
        <div className="mb-2 min-h-[1.375rem]">
          {badge && (
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${BADGE_TONES[badgeTone]}`}>
              {badge}
            </span>
          )}
        </div>
        <h3 className={`font-semibold leading-snug text-[color:var(--ink)] ${compact ? 'min-h-[2.5rem] text-sm' : 'text-base'}`}>
          {name}
        </h3>
        <div className="mt-3">{price}</div>
        {priceNote && (
          <p className={`mt-2 min-h-[2.25rem] leading-snug text-[color:var(--ink-3)] ${compact ? 'text-[11px]' : 'text-xs'}`}>
            {priceNote}
          </p>
        )}
        <div className="mt-4 flex-1 border-t border-[color:var(--line)] pt-4">
          <p className="text-[11px] font-semibold text-[color:var(--ink-3)]">{includedLabel}</p>
          <ul className={`mt-2.5 ${compact ? 'space-y-1.5' : 'space-y-2'}`}>
            {points.map((point, index) => (
              <li
                key={index}
                className={`flex items-start gap-2 leading-snug text-[color:var(--ink-2)] ${compact ? 'text-xs' : 'text-sm'}`}
              >
                <Check className={`mt-0.5 shrink-0 text-brand-600 ${compact ? 'h-3 w-3' : 'h-4 w-4'}`} />
                {point}
              </li>
            ))}
            {excluded?.map((point, index) => (
              <li
                key={`x${index}`}
                className={`flex items-start gap-2 leading-snug text-[color:var(--ink-3)] ${compact ? 'text-xs' : 'text-sm'}`}
              >
                <Minus className={`mt-0.5 shrink-0 text-slate-300 ${compact ? 'h-3 w-3' : 'h-4 w-4'}`} />
                <span className="line-through decoration-slate-300">{point}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-auto flex flex-col">{action}</div>
      </div>
    </div>
  );
}

// Big price figure, consistent across the pricing pages.
export function PriceFigure({ value, suffix, compact }: { value: ReactNode; suffix?: ReactNode; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-end gap-x-1.5">
      <span className={`font-semibold leading-none tracking-tight text-[color:var(--ink)] ${compact ? 'text-[28px]' : 'text-[34px]'}`}>
        {value}
      </span>
      {suffix && <span className="pb-0.5 text-xs text-[color:var(--ink-3)]">{suffix}</span>}
    </div>
  );
}
