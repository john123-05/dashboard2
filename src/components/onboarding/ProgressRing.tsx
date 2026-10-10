// Kleiner Fortschrittsring für „Erste Schritte“ (Navigation, Karte auf der Übersicht, Seitenkopf).
export default function ProgressRing({
  percent,
  size = 44,
  stroke = 4,
  trackClassName = 'text-slate-200',
  className = 'text-brand-600',
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  trackClassName?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = Math.max(0, Math.min(100, percent));
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className={trackClassName} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)}
          className={`${className} transition-[stroke-dashoffset] duration-500`}
        />
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  );
}
