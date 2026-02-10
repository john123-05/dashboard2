import type { ReactNode } from 'react';
import { classNames } from '../../lib/utils';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  animate?: boolean;
}

export default function GlassCard({
  children,
  className = '',
  strong = false,
  animate = true,
}: GlassCardProps) {
  return (
    <div
      className={classNames(
        'rounded-2xl',
        strong ? 'glass-panel-strong' : 'glass-panel',
        animate && 'animate-slide-up',
        className
      )}
    >
      {children}
    </div>
  );
}
