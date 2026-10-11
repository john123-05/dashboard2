import { useI18n } from '../../lib/i18n';
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
  const { t } = useI18n();
  const isPositive = change !== undefined && change >= 0;

  return (
    <GlassCard className="h-full min-h-[132px] overflow-hidden p-4 sm:p-5">
      <div className="flex h-full flex-col">
        <div className="min-w-0 space-y-2 sm:space-y-3">
          {/* Titel und Symbol nebeneinander: das Symbol kann den Titel nie überdecken, lange Wörter brechen um. */}
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 break-words text-xs font-normal leading-snug text-[color:var(--ink-3)] [hyphens:auto] sm:text-sm">
              {title}
            </p>
            <span className={`shrink-0 rounded-lg p-2 ${iconBg}`}>
              <Icon className={`h-4 w-4 ${iconColor}`} />
            </span>
          </div>
          <p className="text-[clamp(1.4rem,5.8vw,1.9rem)] font-light leading-[0.95] tracking-[-0.02em] text-[color:var(--ink)] sm:text-[28px]">
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
            <span className="font-normal text-slate-400">{t('kpi.vs_last_week')}</span>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
