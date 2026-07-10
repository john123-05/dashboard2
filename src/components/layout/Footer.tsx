import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-slate-200/50 bg-white/50 backdrop-blur-sm py-6 text-xs text-slate-500">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p>© 2026 Liftpictures Fotosysteme. All rights reserved.</p>
          <div className="flex gap-6">
            <Link
              to="/privacy-policy"
              className="hover:text-slate-700 transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              to="/support"
              className="hover:text-slate-700 transition-colors"
            >
              Support
            </Link>
            <a
              href="https://www.liftpictures.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-700 transition-colors"
            >
              Website
            </a>
            <Link
              to="/staff/login"
              className="rounded-full bg-slate-100 px-3 py-1 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800"
            >
              Liftpictures Mitarbeiter?
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
