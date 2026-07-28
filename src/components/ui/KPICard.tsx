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
    <GlassCard className="h-full min-h-[138px] p-5 sm:min-h-[132px] sm:p-6">
      <div className="flex h-full items-start justify-between gap-3">
        <div className="min-w-0 space-y-2.5 sm:space-y-3">
          <p className="text-xs font-medium text-slate-500 sm:text-sm">{title}</p>
          <p className="text-[1.95rem] font-bold leading-none tracking-tight text-slate-800 sm:text-2xl">
            {value}
          </p>
          {subtitle && (
            <p className="max-w-[13rem] text-[11px] leading-4 text-slate-500 sm:text-xs sm:leading-5">
              {subtitle}
            </p>
          )}
          {change !== undefined && (
            <div
              className={`flex items-center gap-1 text-xs font-semibold ${
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
        <div className={`shrink-0 rounded-xl p-2.5 sm:p-3 ${iconBg}`}>
          <Icon className={`h-4.5 w-4.5 sm:h-5 sm:w-5 ${iconColor}`} />
        </div>
      </div>
    </GlassCard>
  );
}
