import type { ReactNode } from 'react';
import { ArrowRight, ArrowUpCircle } from 'lucide-react';

// Shared layout for pages of features the park has not booked yet (Redesign
// Phase 3, docs/REDESIGN_PLAN.md). Modelled on HubSpot's locked-feature pages:
// light large headline, arrow bullets, a bordered note, buttons, optional
// picture on the right.

export function UpgradeBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
      <ArrowUpCircle className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

export function ArrowPoint({ title, text }: { title: ReactNode; text?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-brand-600 text-brand-600">
        <ArrowRight className="h-3 w-3" />
      </span>
      <span className="text-sm leading-relaxed text-[color:var(--ink-2)]">
        <span className="block font-semibold text-[color:var(--ink)]">{title}</span>
        {text && <span className="mt-0.5 block">{text}</span>}
      </span>
    </li>
  );
}

// Page title block used above the plan cards (back link, light headline, subtitle).
export function UpgradePageHeader({
  back,
  title,
  subtitle,
  actions,
}: {
  back?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back}
        <h2 className={`${back ? 'mt-3' : ''} text-[28px] font-light leading-tight tracking-tight text-[color:var(--ink)] sm:text-[32px]`}>
          {title}
        </h2>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-[color:var(--ink-3)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export default function UpgradeHero({
  badge,
  title,
  intro,
  points,
  pointColumns = 1,
  note,
  actions,
  aside,
}: {
  badge?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  points?: { title: ReactNode; text?: ReactNode }[];
  pointColumns?: 1 | 2;
  note?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[color:var(--line)] bg-white p-6 sm:p-8">
      <div className={aside ? 'grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]' : ''}>
        <div className="min-w-0">
          {badge && <UpgradeBadge>{badge}</UpgradeBadge>}
          <h3 className={`${badge ? 'mt-4' : ''} max-w-2xl text-[26px] font-light leading-tight tracking-tight text-[color:var(--ink)] sm:text-[30px]`}>
            {title}
          </h3>
          {intro && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[color:var(--ink-2)]">{intro}</p>}
          {points && points.length > 0 && (
            <ul className={`mt-6 grid gap-x-8 gap-y-4 ${pointColumns === 2 ? 'md:grid-cols-2' : ''}`}>
              {points.map((point, index) => (
                <ArrowPoint key={index} title={point.title} text={point.text} />
              ))}
            </ul>
          )}
          {note && (
            <div className="mt-6 max-w-2xl rounded-lg border border-[color:var(--line-strong)] px-4 py-3 text-sm leading-relaxed text-[color:var(--ink-2)]">
              {note}
            </div>
          )}
          {actions && <div className="mt-6 flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
        {aside && <div className="min-w-0 rounded-xl bg-[color:var(--canvas)] p-4 sm:p-6">{aside}</div>}
      </div>
    </div>
  );
}
