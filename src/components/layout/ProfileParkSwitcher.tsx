import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePark } from '../../contexts/ParkContext';
import { invokeEdgeFunction } from '../../lib/edgeFunctions';
import { supabase } from '../../lib/supabase';
import { isSuperAdminEmail } from '../../lib/superAdmin';

type SwitchablePark = { id: string; name: string };

async function loadSwitchableParks(allowedParkIds: string[]): Promise<SwitchablePark[]> {
  const [listed, accessible] = await Promise.all([
    invokeEdgeFunction<{ parks: SwitchablePark[] }>('external-parks'),
    supabase.from('parks').select('id'),
  ]);
  if (listed.error || !listed.data) throw new Error(listed.error || 'Parks konnten nicht geladen werden');
  if (accessible.error) throw new Error(accessible.error.message);

  // external-parks lists every park; the operator project's parks table (RLS)
  // plus allowed_park_ids is what the data functions actually let through.
  const accessibleIds = new Set((accessible.data ?? []).map((row) => String(row.id)));
  return listed.data.parks.filter(
    (park) => accessibleIds.has(park.id) && (allowedParkIds.length === 0 || allowedParkIds.includes(park.id)),
  );
}

function initials(name: string): string {
  const words = name.replace(/["']/g, '').split(/[\s-]+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('') || '?';
}

export default function ProfileParkSwitcher({ onSwitched }: { onSwitched?: () => void }) {
  const { user, profile } = useAuth();
  const { parkId, setPark } = usePark();
  const [open, setOpen] = useState(false);
  const [parks, setParks] = useState<SwitchablePark[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const superAdmin = isSuperAdminEmail(user?.email);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || parks || !user) return;
    let active = true;
    const raw = user.app_metadata?.allowed_park_ids;
    const allowed = Array.isArray(raw) ? raw.map(String) : [];
    setError(null);
    loadSwitchableParks(allowed)
      .then((list) => active && setParks(list))
      .catch((err: unknown) => active && setError(err instanceof Error ? err.message : 'Fehler beim Laden'));
    return () => {
      active = false;
    };
  }, [open, parks, user]);

  if (!profile) return null;

  const identity = (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-slate-200">{profile.full_name}</p>
      <p className="truncate text-xs text-slate-500">{profile.email}</p>
    </div>
  );

  if (!superAdmin) {
    return <div className="mb-3 rounded-xl bg-white/[0.06] px-3 py-2.5">{identity}</div>;
  }

  return (
    <div ref={containerRef} className="relative mb-3">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Park wechseln"
        className="flex w-full items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.1]"
      >
        {identity}
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-500" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Park wechseln"
          className="absolute bottom-full left-0 right-0 z-40 mb-2 max-h-80 overflow-y-auto rounded-xl border border-white/[0.08] bg-slate-900 p-1.5 shadow-2xl"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Park wechseln
          </p>
          {error && <p className="px-2.5 py-2 text-xs text-rose-400">{error}</p>}
          {!parks && !error && (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
            </div>
          )}
          {parks?.length === 0 && <p className="px-2.5 py-2 text-xs text-slate-500">Keine Parks freigegeben.</p>}
          {parks?.map((park) => {
            const current = park.id === parkId;
            return (
              <button
                key={park.id}
                type="button"
                role="option"
                aria-selected={current}
                onClick={() => {
                  setOpen(false);
                  if (current) return;
                  setPark(park.id, park.name);
                  onSwitched?.();
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                  current ? 'bg-white/[0.08] text-white' : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-[11px] font-semibold text-slate-200">
                  {initials(park.name)}
                </span>
                <span className="min-w-0 flex-1 truncate">{park.name}</span>
                {current && <Check className="h-4 w-4 shrink-0 text-brand-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
