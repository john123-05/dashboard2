import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { UpgradePageHeader } from '../components/upgrade/UpgradeHero';
import ShopPackages from '../components/upgrade/ShopPackages';
import { ShopCompare } from '../components/upgrade/PackageCompare';

export default function ShopPricing() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <UpgradePageHeader
        back={
          <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--ink-3)] hover:text-[color:var(--ink)]">
            <ArrowLeft className="h-4 w-4" />
            {t('shop_pricing.back')}
          </Link>
        }
        title={t('shop_pricing.title')}
        subtitle={t('shop_pricing.subtitle')}
      />

      <ShopPackages />
      <ShopCompare />
    </div>
  );
}
