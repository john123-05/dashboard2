import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n';

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-slate-200/50 bg-white/50 backdrop-blur-sm py-6 text-xs text-slate-500">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p>{t('footer.copyright')}</p>
          <div className="flex gap-6">
            <Link
              to="/privacy-policy"
              className="hover:text-slate-700 transition-colors"
            >
              {t('footer.privacy')}
            </Link>
            <Link
              to="/support"
              className="hover:text-slate-700 transition-colors"
            >
              {t('nav.support')}
            </Link>
            <a
              href="https://www.liftpictures.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-700 transition-colors"
            >
              {t('footer.website')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
