import type { EquipmentItem } from './equipment';

type Translate = (key: string, params?: Record<string, string | number>) => string;

const TITLE_KEYS: Record<string, string> = {
  PrintBox: 'equipment.printbox',
  Cashbox: 'equipment.cashbox',
  Speedmessung: 'nav.speed',
  'Speedmessung Display': 'equipment.speed_display',
  'Digitale Nachkäufe und Merchandising': 'equipment.online_shop',
  'CRM Besucherdaten und Digitale Version Hosting': 'equipment.crm',
};

export function equipmentTitle(title: string, t: Translate): string {
  const key = TITLE_KEYS[title];
  return key ? t(key) : title;
}

// Keep the original database value for preisSplit/preisAus. Translation is
// applied only when displaying it; older or custom records stay readable.
export function equipmentPrice(item: EquipmentItem, t: Translate, locale: string): string {
  const original = item.mehrwert_text;
  if (!original) return '';
  const parts = original.split('·').map((part) => part.trim());
  const formatAmount = (part: string) => {
    const match = part.match(/([\d.]+(?:,\d+)?)\s*€/);
    if (!match) return null;
    const amount = Number(match[1].replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(amount) ? amount.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : null;
  };
  const first = formatAmount(parts[0]);
  const second = formatAmount(parts[1] ?? '');
  if (!first) return original;
  if (/monat/i.test(parts[0])) {
    const suffix = parts[1] === '12 Monate Laufzeit' ? t('equipment.term_12')
      : parts[1] === 'danach inklusive' ? t('equipment.included_afterwards') : '';
    const firstYear = /im 1\. Jahr/i.test(parts[0]);
    return `${t(firstYear ? 'equipment.per_month_first_year' : 'equipment.per_month', { amount: first })}${suffix ? ` · ${suffix}` : ''}`;
  }
  if (second && /monat/i.test(parts[1])) {
    return t('equipment.one_time_plus_monthly', { once: first, monthly: second });
  }
  return t('equipment.one_time', { amount: first });
}
