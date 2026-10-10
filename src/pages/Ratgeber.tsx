import { Link } from 'react-router-dom';
import GlassCard from '../components/ui/GlassCard';
import ContactCard from '../components/ratgeber/ContactCard';
import { useI18n, useLocaleTag } from '../lib/i18n';
import { RATGEBER_ARTICLES } from '../lib/ratgeber';

// Ratgeber: Artikelraster (Titelbild + Überschrift), Klick öffnet den Artikel (docs/PRODUKT_PLAN.md, G3).
export default function Ratgeber() {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const articles = [...RATGEBER_ARTICLES].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[28px] font-light tracking-tight text-[color:var(--ink)] sm:text-[32px]">{t('nav.guide')}</h2>
        <p className="mt-1 text-sm text-[color:var(--ink-3)]">{t('ratgeber.subtitle')}</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {articles.map((article) => (
          <Link key={article.slug} to={`/ratgeber/${article.slug}`} className="group block">
            <GlassCard className="h-full overflow-hidden p-0 transition group-hover:border-brand-300">
              <img
                src={article.image}
                alt={article.imageAlt}
                loading="lazy"
                className="aspect-video w-full object-cover"
              />
              <div className="space-y-2 p-5">
                <p className="text-xs text-[color:var(--ink-3)]">
                  {new Date(article.date).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
                  {' · '}
                  {t(`ratgeber.lang_${article.lang}`)}
                </p>
                <h3 className="text-base font-semibold leading-snug text-[color:var(--ink)]">{article.title}</h3>
                <p className="line-clamp-3 text-sm text-[color:var(--ink-2)]">{article.excerpt}</p>
                <p className="pt-1 text-sm font-medium text-brand-700 group-hover:underline">{t('ratgeber.read')}</p>
              </div>
            </GlassCard>
          </Link>
        ))}
      </div>

      <ContactCard />
    </div>
  );
}
