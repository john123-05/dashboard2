import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  onClose: () => void;
  /** Klassen des Dialog-Fensters (Breite, Hintergrund, Rundung). */
  panelClassName: string;
  children: ReactNode;
  closeOnBackdrop?: boolean;
  /** Während einer Aktion (z. B. Löschen) darf der Dialog nicht per Esc/Klick schließen. */
  locked?: boolean;
  labelledBy?: string;
}

// Einheitlicher Dialog: Abdunklung, Esc schließt, Klick daneben schließt (abschaltbar),
// Seite dahinter scrollt nicht, Fokus wandert in den Dialog und danach zurück.
export default function Modal({
  onClose,
  panelClassName,
  children,
  closeOnBackdrop = true,
  locked = false,
  labelledBy,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const lockedRef = useRef(locked);
  onCloseRef.current = onClose;
  lockedRef.current = locked;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !lockedRef.current) onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (closeOnBackdrop && !locked && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`${panelClassName} outline-none`}
      >
        {children}
      </div>
    </div>
  );
}
