import { useI18n, useLocaleTag } from '../../lib/i18n';
import CompareTable, { type CompareRow } from './CompareTable';
import { MONTHLY_PRICE, REVENUE_SHARE_PERCENT, SETUP_PRICE } from './ShopPackages';
import { PLANS } from './SpeedPackages';

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

/** Vergleich der drei Speedmessung-Pakete. */
export function SpeedCompare() {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const [basis, display, long] = PLANS;
  const rows: CompareRow[] = [
    yes3('speed.offer.free_hardware'),
    yes3('speed.offer.setup'),
    yes3('speed.offer.photo_speed'),
    yes3('speed.offer.photo_code'),
    yes3('speed.offer.daily_stats'),
    yes3('speed.offer.ranking'),
    yes3('speed.offer.guest_page'),
    yes3('speed.offer.benefit_edit'),
    yes3('speed.offer.benefit_analyse'),
    yes3('speed.offer.hosting'),
    yes3('speed.offer.database'),
    yes3('speed.offer.maintenance'),
    { labelKey: 'speed.offer.display_large', cells: [false, true, false] },
    { labelKey: 'pp.row_monthly', cells: [basis, display, long].map((p) => eur(p.monthly, locale)) },
    { labelKey: 'pp.row_year2', cells: [eur(basis.monthly, locale), eur(display.fromYear2 ?? display.monthly, locale), eur(long.monthly, locale)] },
    { labelKey: 'pp.row_term', cells: [basis, display, long].map((p) => (p.months === 48 ? 'pp.cell_48m' : 'pp.cell_12m')) },
  ];
  return (
    <CompareTable
      title={t('pp.compare_speed_title')}
      note={t('pp.compare_note')}
      columns={[
        { label: t(basis.name) },
        { label: t(display.name), highlight: true },
        { label: t(long.name) },
      ]}
      rows={rows}
    />
  );
}
