import { Fragment, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import GlassCard from './GlassCard';
import { useI18n } from '../../lib/i18n';

interface Column<T> {
  key: string;
  label: React.ReactNode;
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
  /** Zwischenzeilen: Zeilen mit gleichem Schlüssel (z. B. Tag) stehen unter einer gemeinsamen Überschrift. */
  groupBy?: (item: T) => string;
  renderGroup?: (key: string, items: T[]) => React.ReactNode;
}

export default function DataTable<T extends object>({
  data,
  columns,
  title,
  searchable = false,
  searchKeys = [],
  pageSize = 10,
  actions,
  groupBy,
  renderGroup,
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

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100/80">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-6 py-3 text-left text-xs font-medium text-slate-500 ${col.className || ''}`}
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
              paginated.map((item, i) => {
                const key = groupBy ? groupBy(item) : null;
                const startsGroup = groupBy && renderGroup && (i === 0 || groupBy(paginated[i - 1]) !== key);
                return (
                  <Fragment key={i}>
                    {startsGroup && key !== null && (
                      <tr className="bg-slate-50">
                        <td colSpan={columns.length} className="px-6 py-2 text-xs font-medium text-slate-500">
                          {renderGroup(key, paginated.filter((row) => groupBy(row) === key))}
                        </td>
                      </tr>
                    )}
                    <tr className="transition-colors hover:bg-slate-50">
                      {columns.map((col) => (
                        <td key={col.key} className={`px-6 py-3.5 text-sm text-slate-700 ${col.className || ''}`}>
                          {col.render ? col.render(item) : String(item[col.key as keyof T] ?? '')}
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Handy (< 640 px): jede Zeile als Karte – Hauptspalte fett, Nebenwerte darunter. */}
      <div className="sm:hidden">
        {paginated.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">{t('table.no_data')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {paginated.map((item, i) => {
              const cell = (col: Column<T>) => (col.render ? col.render(item) : String(item[col.key as keyof T] ?? ''));
              const selectCol = columns.find((col) => col.key === 'select');
              const actionCol = columns.find((col) => col.key === 'actions');
              const dataCols = columns.filter((col) => col.key !== 'select' && col.key !== 'actions');
              const [main, ...rest] = dataCols;
              const key = groupBy ? groupBy(item) : null;
              const startsGroup = groupBy && renderGroup && (i === 0 || groupBy(paginated[i - 1]) !== key);
              return (
                <Fragment key={i}>
                {startsGroup && key !== null && (
                  <li className="bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500">
                    {renderGroup(key, paginated.filter((row) => groupBy(row) === key))}
                  </li>
                )}
                <li className="space-y-2 px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    {selectCol && <div className="pt-0.5">{cell(selectCol)}</div>}
                    <div className="min-w-0 flex-1 text-sm font-semibold text-slate-800">{main && cell(main)}</div>
                    {actionCol && <div className="shrink-0">{cell(actionCol)}</div>}
                  </div>
                  {rest.length > 0 && (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {rest.map((col) => (
                        <div key={col.key} className="min-w-0">
                          {typeof col.label === 'string' && col.label && (
                            <dt className="text-[11px] text-slate-400">{col.label}</dt>
                          )}
                          <dd className="break-words text-sm text-slate-700">{cell(col)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
                </Fragment>
              );
            })}
          </ul>
        )}
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
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs font-medium text-slate-600">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
