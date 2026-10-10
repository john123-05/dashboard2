import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

// Schublade von rechts (Detailansicht zu einer Zeile). Esc und Klick daneben schließen.
export default function Drawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[80]" role="presentation">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line)] px-6 py-5">
          <div className="min-w-0">
            {subtitle && <p className="text-xs text-[color:var(--ink-3)]">{subtitle}</p>}
            <h3 className="mt-1 truncate text-lg font-semibold text-[color:var(--ink)]">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('mk.close')}
            className="rounded-md p-1.5 text-[color:var(--ink-3)] hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6">{children}</div>
      </aside>
    </div>
  );
}

/** Zeile „Beschriftung – Wert“ für den Inhalt einer Schublade. */
export function DrawerRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-[color:var(--line)] py-3 last:border-0">
      <dt className="text-sm text-[color:var(--ink-3)]">{label}</dt>
      <dd className="break-words text-sm text-[color:var(--ink)]">{children}</dd>
    </div>
  );
}
