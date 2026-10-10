/** Ladeplatzhalter statt Spinner: `lines` graue Zeilen oder ein Block mit fester Höhe. */
export default function Skeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`animate-pulse space-y-3 ${className}`} role="status" aria-busy="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-4 rounded bg-slate-100" style={{ width: `${100 - (i % 3) * 18}%` }} />
      ))}
    </div>
  );
}
