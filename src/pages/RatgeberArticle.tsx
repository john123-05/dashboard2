import { Fragment } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import ContactCard from '../components/ratgeber/ContactCard';
import { useI18n, useLocaleTag } from '../lib/i18n';
import { articleBySlug, useArticles } from '../lib/ratgeber';

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

/** Text mit anklickbaren Adressen; Satzzeichen am Ende gehören nicht zum Link. */
function withLinks(text: string) {
  return text.split(URL_PATTERN).map((part, index) => {
    if (!/^https?:\/\//.test(part)) return <Fragment key={index}>{part}</Fragment>;
    const url = part.replace(/[.,;:!?)]+$/, '');
    return (
      <Fragment key={index}>
        <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 underline">
          {url}
        </a>
        {part.slice(url.length)}
      </Fragment>
    );
  });
}

export default function RatgeberArticle() {
  const { slug } = useParams();
  const { t, language } = useI18n();
  const locale = useLocaleTag();
  const { articles, loading } = useArticles();
  const article = articleBySlug(slug, articles);
  if (!article) return loading ? null : <Navigate to="/ratgeber" replace />;
  const paragraphs = article.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/ratgeber" className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ink-3)] hover:text-[color:var(--ink)]">
        <ArrowLeft className="h-4 w-4" /> {t('ratgeber.back')}
      </Link>

      {article.image && <img src={article.image} alt={article.imageAlt} className="aspect-video w-full rounded-xl object-cover" />}

      <div>
        <h1 className="text-[28px] font-light leading-tight tracking-tight text-[color:var(--ink)] sm:text-[32px]">{article.title}</h1>
        <p className="mt-2 text-sm text-[color:var(--ink-3)]">
          Tom Nolting · {new Date(article.date).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        {article.lang !== language && (
          <p className="mt-2 text-xs text-[color:var(--ink-3)]">
            {t('ratgeber.lang_note', { lang: t(`ratgeber.lang_${article.lang}`) })}
          </p>
        )}
      </div>

      <GlassCard className="space-y-4 p-5 text-[15px] leading-relaxed text-[color:var(--ink-2)] sm:p-7">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line">{withLinks(paragraph)}</p>
        ))}
      </GlassCard>

      <ContactCard />
    </div>
  );
}
