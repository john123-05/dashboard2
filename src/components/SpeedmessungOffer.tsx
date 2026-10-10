import { useI18n } from '../lib/i18n';
import UpgradeHero from './upgrade/UpgradeHero';
import SpeedPackages from './upgrade/SpeedPackages';
import { SpeedCompare } from './upgrade/PackageCompare';

const BENEFITS = [
  { title: 'speed.offer.benefit_profile', text: 'speed.offer.benefit_profile_text' },
  { title: 'speed.offer.benefit_record', text: 'speed.offer.benefit_record_text' },
  { title: 'speed.offer.benefit_periods', text: 'speed.offer.benefit_periods_text' },
  { title: 'speed.offer.benefit_social', text: 'speed.offer.benefit_social_text' },
  { title: 'speed.offer.benefit_purchased', text: 'speed.offer.benefit_purchased_text' },
  { title: 'speed.offer.benefit_edit', text: 'speed.offer.benefit_edit_text' },
  { title: 'speed.offer.benefit_analyse', text: 'speed.offer.benefit_analyse_text' },
];

export default function SpeedmessungOffer() {
  const { t } = useI18n();
  return (
    <section className="space-y-5">
      <UpgradeHero
        badge={t('speed.offer.locked')}
        title={t('speed.offer.headline')}
        intro={t('speed.offer.intro')}
        points={BENEFITS.map((item) => ({ title: t(item.title), text: t(item.text) }))}
        pointColumns={2}
        note={t('speed.offer.summary')}
      />
      <SpeedPackages />
      <SpeedCompare />
    </section>
  );
}
