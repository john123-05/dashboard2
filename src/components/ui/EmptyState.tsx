import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Einheitlicher Leerzustand: Symbol, Text, optional ein Knopf (z. B. „Erste E-Mail schreiben“). */
export default function EmptyState({ icon: Icon, text, action }: { icon: LucideIcon; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[color:var(--line-strong)] bg-slate-50 px-6 py-10 text-center">
      <Icon className="h-7 w-7 text-slate-300" aria-hidden />
      <p className="max-w-md text-sm text-[color:var(--ink-3)]">{text}</p>
      {action}
    </div>
  );
}
