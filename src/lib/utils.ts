const LOCALE_BY_LANGUAGE: Record<string, string> = {
  de: 'de-DE',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  it: 'it-IT',
  nl: 'nl-NL',
  lv: 'lv-LV',
};

let formatterLanguage = 'de';

export function setFormatterLanguage(language: string): void {
  formatterLanguage = LOCALE_BY_LANGUAGE[language] ? language : 'de';
}

export function getFormatterLocale(): string {
  return LOCALE_BY_LANGUAGE[formatterLanguage] || 'de-DE';
}

function justNowLabel(): string {
  switch (formatterLanguage) {
    case 'en':
      return 'Just now';
    case 'es':
      return 'Justo ahora';
    case 'fr':
      return 'À l’instant';
    case 'it':
      return 'Proprio ora';
    case 'nl':
      return 'Zojuist';
    case 'lv':
      return 'Tikko';
    default:
      return 'Gerade eben';
  }
}

export function formatCurrency(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat(getFormatterLocale(), {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(getFormatterLocale()).format(n);
}

export function formatPercent(n: number): string {
  return `${new Intl.NumberFormat(getFormatterLocale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n)}%`;
}

export function formatDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat(getFormatterLocale(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

export function formatDateTime(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat(getFormatterLocale(), {
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
  const formatter = new Intl.RelativeTimeFormat(getFormatterLocale(), { numeric: 'auto' });

  if (minutes < 1) return justNowLabel();
  if (minutes < 60) return formatter.format(-minutes, 'minute');
  if (hours < 24) return formatter.format(-hours, 'hour');
  if (days < 7) return formatter.format(-days, 'day');
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
