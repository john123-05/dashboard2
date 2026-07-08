import type { ReactNode } from 'react';

export default function ComingSoonOverlay({
  description,
  children,
}: {
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none max-h-[80vh] select-none overflow-hidden blur-sm" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/50 p-6">
        <div className="glass-panel-strong max-w-md rounded-3xl p-8 text-center shadow-xl">
          <h3 className="text-xl font-bold text-slate-800">Bald verfügbar</h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{description}</p>
        </div>
      </div>
    </div>
  );
}
