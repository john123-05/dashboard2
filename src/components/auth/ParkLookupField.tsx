import { useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { invokeEdgeFunction } from '../../lib/edgeFunctions';

export type ParkChoice = { id: string; name: string };

// Park-Auswahl ohne Liste aller Kunden: man tippt die ersten Buchstaben, die Function `park-lookup` gibt
// höchstens EINEN Park zurück (erst wenn die Eingabe eindeutig ist). Für Anmeldung und „Konto erstellen“.
export default function ParkLookupField({ selected, onSelect }: { selected: ParkChoice | null; onSelect: (park: ParkChoice | null) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [match, setMatch] = useState<ParkChoice | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'short' | 'none' | 'many' | 'one'>('idle');

  useEffect(() => {
    const q = query.trim();
    setMatch(null);
    if (selected || q.length === 0) { setState('idle'); return; }
    if (q.length < 2) { setState('short'); return; }
    setState('loading');
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { data, error } = await invokeEdgeFunction<{ park: ParkChoice | null; state: 'short' | 'none' | 'many' | 'one' }>(
        'park-lookup', { query: { q } },
      );
      if (cancelled) return;
      if (error || !data) { setState('none'); return; }
      setMatch(data.park);
      setState(data.park ? 'one' : data.state);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, selected]);

  function pick(park: ParkChoice) {
    setQuery('');
    onSelect(park);
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('auth.park')}</label>
      {selected ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <Check className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{selected.name}</span>
          <button
            type="button"
            onClick={() => { onSelect(null); setState('idle'); }}
            aria-label={t('auth.park_change')}
            title={t('auth.park_change')}
            className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && match) { e.preventDefault(); pick(match); }
            }}
            placeholder={t('auth.park_search_placeholder')}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby="park-hint"
            className="glass-input"
          />
          <div id="park-hint" className="mt-1.5 min-h-[2.25rem] text-xs text-slate-500" aria-live="polite">
            {match ? (
              <button
                type="button"
                onClick={() => pick(match)}
                className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800 shadow-sm hover:border-brand-400"
              >
                <span className="min-w-0 flex-1 truncate">{match.name}</span>
                <span className="shrink-0 text-xs font-semibold text-brand-600">{t('auth.park_pick', { park: '' }).trim()}</span>
              </button>
            ) : state === 'loading' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : state === 'many' ? (
              t('auth.park_many')
            ) : state === 'none' ? (
              t('auth.park_none')
            ) : (
              t('auth.park_hint')
            )}
          </div>
        </>
      )}
    </div>
  );
}
