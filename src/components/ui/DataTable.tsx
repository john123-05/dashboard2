import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import GlassCard from './GlassCard';
import { useI18n } from '../../lib/i18n';

interface Column<T> {
  key: string;
  label: ReactNode;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

export type DataTableColumn<T extends object> = Column<T>;

interface DataTableProps<T extends object> {
  data: T[];
  columns: DataTableColumn<T>[];
  title?: string;
  searchable?: boolean;
  searchKeys?: string[];
  pageSize?: number;
  actions?: React.ReactNode;
}

export default function DataTable<T extends object>({
  data,
  columns,
  title,
  searchable = false,
  searchKeys = [],
  pageSize = 10,
  actions,
}: DataTableProps<T>) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filtered = searchable
    ? data.filter((item) =>
        searchKeys.some((key) => {
          const val = item[key as keyof T];
          return val && String(val).toLowerCase().includes(search.toLowerCase());
        })
      )
    : data;

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <GlassCard className="overflow-hidden">
      {(title || searchable || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100/80 px-6 py-4">
          {title && <h3 className="text-base font-semibold text-slate-800">{title}</h3>}
          <div className="flex items-center gap-3">
            {searchable && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={t('table.search')}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className="glass-input py-2 pl-9 pr-4 text-sm"
                />
              </div>
            )}
            {actions}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100/80">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 ${col.className || ''}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-sm text-slate-400">
                  {t('table.no_data')}
                </td>
              </tr>
            ) : (
              paginated.map((item, i) => (
                <tr
                  key={i}
                  className="transition-colors hover:bg-white/40"
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-6 py-3.5 text-sm text-slate-700 ${col.className || ''}`}>
                      {col.render ? col.render(item) : String(item[col.key as keyof T] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100/80 px-6 py-3">
          <p className="text-xs text-slate-400">
            {t('table.showing')} {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} {t('table.of')}{' '}
            {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/60 hover:text-slate-700 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs font-medium text-slate-600">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/60 hover:text-slate-700 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
