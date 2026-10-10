import { useI18n, useLocaleTag } from '../../lib/i18n';
import CompareTable, { type CompareRow } from './CompareTable';
import { MONTHLY_PRICE, REVENUE_SHARE_PERCENT, SETUP_PRICE } from './ShopPackages';
import { PLANS } from './SpeedPackages';
import { FREE_MONTHS_TWO_YEARS, FREE_MONTHS_YEAR, POINTS, SOFTWARE_MONTHLY, SOFTWARE_MONTHLY_DISPLAY } from './SoftwarePackages';

const eur = (value: number, locale: string) =>
  value.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const yes3 = (labelKey: string): CompareRow => ({ labelKey, cells: [true, true, true] });

/** Vergleich der drei Wege zum Online-Shop (Spalten wie die Karten darüber). */
export function ShopCompare() {
  const { t } = useI18n();
  const locale = useLocaleTag();
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
  const { t } = useI18n();
  const locale = useLocaleTag();
  const [basis, display, long] = PLANS;
  const all4 = (labelKey: string): CompareRow => ({ labelKey, cells: [true, true, true, true] });
  const rows: CompareRow[] = [
    { labelKey: 'speed.offer.hardware', cells: [true, true, true, 'pp.cell_have'] },
    { labelKey: 'speed.offer.free_hardware', cells: [true, true, true, false] },
    all4('speed.offer.setup'),
    all4('speed.offer.photo_speed'),
    all4('speed.offer.photo_code'),
    all4('speed.offer.daily_stats'),
    all4('speed.offer.ranking'),
    all4('speed.offer.guest_page'),
    all4('speed.offer.benefit_edit'),
    all4('speed.offer.benefit_analyse'),
    all4('speed.offer.hosting'),
    all4('speed.offer.database'),
    all4('speed.offer.maintenance'),
    { labelKey: 'speed.offer.display_large', cells: [false, true, false, 'pp.cell_optional'] },
    { labelKey: 'pp.row_monthly', cells: [...[basis, display, long].map((p) => eur(p.monthly, locale)), 'pp.cell_sw_monthly'] },
    { labelKey: 'pp.row_year2', cells: [eur(basis.monthly, locale), eur(display.fromYear2 ?? display.monthly, locale), eur(long.monthly, locale), eur(SOFTWARE_MONTHLY, locale)] },
    { labelKey: 'pp.row_term', cells: [...[basis, display, long].map((p) => (p.months === 48 ? 'pp.cell_48m' : 'pp.cell_12m')), 'pp.cell_12m'] },
  ];
  return (
    <CompareTable
      title={t('pp.compare_speed_title')}
      note={t('pp.compare_note')}
      columns={[
        { label: t(basis.name) },
        { label: t(display.name), highlight: true },
        { label: t(long.name) },
        { label: t('speed.offer.sw_name'), sub: t('speed.offer.sw_badge') },
      ]}
      rows={rows}
    />
  );
}

/** Vergleich der drei Software-Pakete (für Parks, die die Messhardware schon haben). */
export function SoftwareCompare() {
  const { t } = useI18n();
  const locale = useLocaleTag();
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
