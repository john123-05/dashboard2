import { useI18n, useLocaleTag } from '../../lib/i18n';
import { catalogCompare, useCatalog } from '../../lib/catalog';
import CompareTable, { type CompareRow } from './CompareTable';
import { MONTHLY_PRICE, REVENUE_SHARE_PERCENT, SETUP_PRICE } from './ShopPackages';
import { PLANS } from './SpeedPackages';
import { FREE_MONTHS_TWO_YEARS, FREE_MONTHS_YEAR, POINTS, SOFTWARE_MONTHLY, SOFTWARE_MONTHLY_DISPLAY } from './SoftwarePackages';

const eur = (value: number, locale: string) =>
  value.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const yes3 = (labelKey: string): CompareRow => ({ labelKey, cells: [true, true, true] });

/** Vergleich der drei Wege zum Online-Shop (Spalten wie die Karten darüber). */
export function ShopCompare() {
  const { t, language } = useI18n();
  const locale = useLocaleTag();
  const catalog = useCatalog();
  const fromCatalog = catalogCompare(catalog, 'shop', { language, locale, t });
  if (fromCatalog) {
    return <CompareTable title={t('pp.compare_shop_title')} note={t('pp.compare_note')} columns={fromCatalog.columns} rows={fromCatalog.rows} />;
  }
  const rows: CompareRow[] = [
    yes3('shop_pricing.point_design'),
    yes3('shop_pricing.point_setup'),
    yes3('shop_pricing.point_products'),
    yes3('shop_pricing.point_payments'),
    yes3('shop_pricing.point_hosting'),
    yes3('shop_pricing.point_database'),
    yes3('shop_pricing.point_sales'),
    { labelKey: 'shop_pricing.full_shipping', cells: [false, false, true] },
    { labelKey: 'pp.row_setup_cost', cells: [eur(SETUP_PRICE, locale), eur(SETUP_PRICE, locale), eur(0, locale)] },
    { labelKey: 'pp.row_monthly', cells: [eur(MONTHLY_PRICE, locale), 'pp.cell_shop_year', eur(0, locale)] },
    { labelKey: 'pp.row_share', cells: ['0 %', '0 %', `${REVENUE_SHARE_PERCENT} %`] },
  ];
  return (
    <CompareTable
      title={t('pp.compare_shop_title')}
      note={t('pp.compare_note')}
      columns={[
        { label: t('shop_pricing.monthly_name') },
        { label: t('shop_pricing.yearly_name'), highlight: true },
        { label: t('shop_pricing.full_name') },
      ]}
      rows={rows}
    />
  );
}

/** Vergleich der Speedmessung-Pakete (drei mit Hardware, eines nur Software für Parks mit Hardware). */
export function SpeedCompare() {
  const { t, language } = useI18n();
  const locale = useLocaleTag();
  const catalog = useCatalog();
  const fromCatalog = catalogCompare(catalog, 'speed', { language, locale, t });
  if (fromCatalog) {
    return <CompareTable title={t('pp.compare_speed_title')} note={t('pp.compare_note')} columns={fromCatalog.columns} rows={fromCatalog.rows} />;
  }
  const [basis, display, long] = PLANS;
  const rows: CompareRow[] = [
    ...['speed.offer.free_hardware', 'speed.offer.setup', 'speed.offer.photo_speed', 'speed.offer.photo_code', 'speed.offer.daily_stats',
      'speed.offer.ranking', 'speed.offer.guest_page', 'speed.offer.benefit_edit', 'speed.offer.benefit_analyse',
      'speed.offer.hosting', 'speed.offer.database', 'speed.offer.maintenance'].map((key) => yes3(key)),
    { labelKey: 'speed.offer.display_large', cells: [false, true, false] },
    { labelKey: 'pp.row_monthly', cells: [basis, display, long].map((p) => eur(p.monthly, locale)) },
    { labelKey: 'pp.row_year2', cells: [eur(basis.monthly, locale), eur(display.fromYear2 ?? display.monthly, locale), eur(long.monthly, locale)] },
    { labelKey: 'pp.row_term', cells: [basis, display, long].map((p) => (p.months === 48 ? 'pp.cell_48m' : 'pp.cell_12m')) },
  ];
  return (
    <CompareTable
      title={t('pp.compare_speed_title')}
      note={t('pp.compare_note')}
      columns={[{ label: t(basis.name) }, { label: t(display.name), highlight: true }, { label: t(long.name) }]}
      rows={rows}
    />
  );
}

/** Vergleich der drei Software-Pakete (für Parks, die die Messhardware schon haben). */
export function SoftwareCompare() {
  const { t, language } = useI18n();
  const locale = useLocaleTag();
  const catalog = useCatalog();
  const fromCatalog = catalogCompare(catalog, 'software', { language, locale, t });
  if (fromCatalog) {
    return <CompareTable title={t('pp.compare_software_title')} note={t('pp.compare_note')} columns={fromCatalog.columns} rows={fromCatalog.rows} />;
  }
  const prepay = (months: number, free: number) => eur((months - free) * SOFTWARE_MONTHLY, locale);
  const rows: CompareRow[] = [
    ...POINTS.map((key) => yes3(key)),
    { labelKey: 'pp.row_monthly', cells: [eur(SOFTWARE_MONTHLY, locale), eur(SOFTWARE_MONTHLY, locale), eur(SOFTWARE_MONTHLY, locale)] },
    { labelKey: 'pp.row_display_monthly', cells: [eur(SOFTWARE_MONTHLY_DISPLAY, locale), eur(SOFTWARE_MONTHLY_DISPLAY, locale), eur(SOFTWARE_MONTHLY_DISPLAY, locale)] },
    { labelKey: 'pp.row_term', cells: ['pp.cell_12m', 'pp.cell_12m', 'pp.cell_24m'] },
    { labelKey: 'pp.row_free_months', cells: ['0', String(FREE_MONTHS_YEAR), String(FREE_MONTHS_TWO_YEARS)] },
    { labelKey: 'pp.row_prepay', cells: ['—', prepay(12, FREE_MONTHS_YEAR), prepay(24, FREE_MONTHS_TWO_YEARS)] },
  ];
  return (
    <CompareTable
      title={t('pp.compare_software_title')}
      note={t('pp.compare_note')}
      columns={[
        { label: t('speed.offer.sw_plan_monthly') },
        { label: t('speed.offer.sw_plan_year'), highlight: true },
        { label: t('speed.offer.sw_plan_two_years') },
      ]}
      rows={rows}
    />
  );
}
