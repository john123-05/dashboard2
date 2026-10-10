import { Check, Minus } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import GlassCard from '../ui/GlassCard';

export type CompareCell = boolean | string;
export type CompareColumn = { label: string; sub?: string; highlight?: boolean };
export type CompareRow = { labelKey?: string; label?: string; cells: CompareCell[]; soon?: boolean };

// Eine Vergleichstabelle für alle Gruppen in „Preise & Pakete“ (Marketing, Shop, Speedmessung, Fotosystem).
// Zellen: true/false = Haken/Strich, sonst Text; Text der wie ein Übersetzungsschlüssel aussieht wird übersetzt.
export default function CompareTable({
  title,
  note,
  columns,
  rows,
}: {
  title: string;
  note?: string;
  columns: CompareColumn[];
  rows: CompareRow[];
}) {
  const { t } = useI18n();
  const show = (cell: CompareCell) => {
    if (cell === true) return <Check className="mx-auto h-4 w-4 text-brand-600" aria-label="✓" />;
    if (cell === false) return <Minus className="mx-auto h-4 w-4 text-slate-300" aria-label="–" />;
    return <span className="text-sm text-[color:var(--ink)]">{/^[a-z][a-z0-9_]*\.[a-z0-9_.]+$/.test(cell) ? t(cell) : cell}</span>;
  };
  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="border-b border-[color:var(--line)] px-5 py-4">
        <h3 className="text-base font-semibold text-[color:var(--ink)]">{title}</h3>
        {note && <p className="mt-0.5 text-xs text-[color:var(--ink-3)]">{note}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-[color:var(--line)] text-xs text-[color:var(--ink-3)]">
              <th className="sticky left-0 bg-white px-5 py-3 font-medium" />
              {columns.map((column) => (
                <th
                  key={column.label}
                  className={`min-w-[8rem] px-3 py-3 text-center font-semibold ${column.highlight ? 'text-brand-700' : 'text-[color:var(--ink-2)]'}`}
                >
                  {column.label}
                  {column.sub && <span className="block text-[11px] font-normal text-[color:var(--ink-3)]">{column.sub}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--line)]">
            {rows.map((row) => (
              <tr key={row.label ?? row.labelKey}>
                <td className="sticky left-0 bg-white px-5 py-3 text-sm text-[color:var(--ink-2)]">
                  {row.label ?? (row.labelKey ? t(row.labelKey) : '')}
                  {row.soon && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{t('plans.soon')}</span>
                  )}
                </td>
                {row.cells.map((cell, index) => (
                  <td key={index} className="px-3 py-3 text-center">
                    {show(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
