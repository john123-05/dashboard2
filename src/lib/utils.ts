export function formatCurrency(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function formatDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

export function formatDateTime(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

export function formatRelative(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '-';
  const now = Date.now();
  const diff = now - parsed.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
}

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string
): void {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          const str = val === null || val === undefined ? '' : String(val);
          return str.includes(',') || str.includes('"')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(',')
    ),
  ];

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function classNames(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function severityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'text-rose-600 bg-rose-50';
    case 'error':
      return 'text-orange-600 bg-orange-50';
    case 'warning':
      return 'text-amber-600 bg-amber-50';
    default:
      return 'text-sky-600 bg-sky-50';
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case 'completed':
    case 'active':
    case 'resolved':
      return 'text-emerald-700 bg-emerald-50 ring-emerald-200';
    case 'pending':
    case 'in_progress':
    case 'open':
    case 'maintenance':
      return 'text-amber-700 bg-amber-50 ring-amber-200';
    case 'refunded':
    case 'closed':
    case 'inactive':
      return 'text-slate-600 bg-slate-50 ring-slate-200';
    case 'expired':
      return 'text-rose-700 bg-rose-50 ring-rose-200';
    default:
      return 'text-slate-600 bg-slate-50 ring-slate-200';
  }
}
