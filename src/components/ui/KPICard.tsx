import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import GlassCard from './GlassCard';

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  change?: number;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
}

export default function KPICard({
  title,
  value,
  subtitle,
  change,
  icon: Icon,
  iconColor = 'text-brand-600',
  iconBg = 'bg-brand-50',
}: KPICardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <GlassCard className="relative h-full min-h-[148px] overflow-hidden p-4 sm:min-h-[132px] sm:p-6">
      <div className={`absolute right-4 top-4 shrink-0 rounded-xl p-2 sm:right-6 sm:top-6 sm:p-3 ${iconBg}`}>
        <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${iconColor}`} />
      </div>
      <div className="flex h-full flex-col">
        <div className="min-w-0 space-y-2 sm:space-y-3">
          <p className="max-w-[9rem] pr-12 text-[11px] font-medium leading-[1.2] text-slate-500 sm:max-w-none sm:pr-14 sm:text-sm">
            {title}
          </p>
          <p className="text-[clamp(1.35rem,5.8vw,1.9rem)] font-bold leading-[0.95] tracking-[-0.03em] text-slate-800 sm:text-2xl">
            {value}
          </p>
          {subtitle && (
            <p className="max-w-[10rem] text-[11px] leading-4 text-slate-500 sm:max-w-[13rem] sm:text-xs sm:leading-5">
              {subtitle}
            </p>
          )}
        </div>
        {change !== undefined && (
          <div
            className={`mt-auto flex items-center gap-1 pt-3 text-[11px] font-semibold sm:text-xs ${
              isPositive ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {isPositive ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            <span>
              {isPositive ? '+' : ''}
              {change.toFixed(1)}%
            </span>
            <span className="font-normal text-slate-400">vs last week</span>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
