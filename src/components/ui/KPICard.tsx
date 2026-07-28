import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import GlassCard from './GlassCard';
import { useI18n } from '../../lib/i18n';
import { getOperatorUiText } from '../../lib/operatorUiText';

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
  const { language } = useI18n();
  const isPositive = change !== undefined && change >= 0;

  return (
    <GlassCard className="p-6 h-[132px]">
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-2xl font-bold tracking-tight text-slate-800">{value}</p>
          {subtitle && (
            <p className="max-w-[12rem] text-xs leading-5 text-slate-500">{subtitle}</p>
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
              <span className="font-normal text-slate-400">
                {getOperatorUiText(language, 'kpi.vs_last_week')}
              </span>
            </div>
          )}
        </div>
        <div className={`rounded-xl p-3 ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>
    </GlassCard>
  );
}
