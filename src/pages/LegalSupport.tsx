import { Mail, Phone, Clock, AlertCircle, RefreshCw, Bell, LogIn, Zap, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';

export default function LegalSupport() {
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);

  const troubleshooting = [
    {
      id: 1,
      title: 'Login Issues',
      icon: LogIn,
      items: [
        'Verify your email address is correct',
        'Reset your password using the "Forgot Password" link',
        'Check that your browser allows cookies and JavaScript',
        'Try a different browser or clear your browser cache',
        'Ensure you have selected the correct Park',
        'Contact support if the issue persists',
      ],
    },
    {
      id: 2,
      title: 'Synchronization Problems',
      icon: RefreshCw,
      items: [
        'Check your internet connection',
        'Verify all parks have internet connectivity',
        'Refresh the dashboard (Ctrl+R or Cmd+R)',
        'Check if the app version is up to date',
        'Wait 2–5 minutes for automatic sync to complete',
        'Contact support if data remains out of sync',
      ],
    },
    {
      id: 3,
      title: 'Notification Issues',
      icon: Bell,
      items: [
        'Verify notifications are enabled in your app settings',
        'Check your device notifications are not muted or disabled',
        'Re-authorize the app to send notifications',
        'Uninstall and reinstall the app if needed',
        'Check internet connection (notifications require active connection)',
        'Contact support for persistent notification problems',
      ],
    },
    {
      id: 4,
      title: 'App Updates & Version',
      icon: Zap,
      items: [
        'Check the app version in your Settings page',
        'Enable automatic updates on your device app store',
        'Visit your device app store and update manually if needed',
        'Restart your device after updating',
        'Contact support if update fails or app crashes after update',
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-12 lg:py-16">
        <div className="mb-12 text-center">
          <h1 className="mb-2 text-4xl font-bold tracking-tight text-slate-900">
            Support
          </h1>
          <p className="text-sm text-slate-500">
            Get help and contact our support team
          </p>
        </div>

        <div className="space-y-8 rounded-2xl bg-white p-8 shadow-sm lg:p-12">
          <section>
            <h2 className="mb-6 text-2xl font-bold text-slate-900">Get in Touch</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-6 hover:shadow-md transition-shadow">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100">
                  <Mail className="h-6 w-6 text-orange-600" />
                </div>
                <h3 className="mb-2 font-semibold text-slate-900">Email Support</h3>
                <p className="text-sm text-slate-600 mb-3">
                  Send us your questions or issues
                </p>
                <a
                  href="mailto:info@liftpictures.com"
                  className="inline-flex items-center gap-2 rounded-lg bg-orange-50 px-3 py-2 text-sm font-medium text-orange-600 hover:bg-orange-100 transition-colors"
                >
                  info@liftpictures.com
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>

              <div className="rounded-lg border border-slate-200 p-6 hover:shadow-md transition-shadow">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100">
                  <Phone className="h-6 w-6 text-orange-600" />
                </div>
                <h3 className="mb-2 font-semibold text-slate-900">Phone Support</h3>
                <p className="text-sm text-slate-600 mb-3">
                  For urgent issues during business hours
                </p>
                <a
                  href="tel:+49522285049"
                  className="inline-flex items-center gap-2 rounded-lg bg-orange-50 px-3 py-2 text-sm font-medium text-orange-600 hover:bg-orange-100 transition-colors"
                >
                  +49 5222 8504-90
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-6 text-2xl font-bold text-slate-900">Response Times</h2>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex gap-3">
                <Clock className="h-5 w-5 flex-shrink-0 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-slate-900">Expected Response Time</h3>
                  <p className="text-sm text-slate-700 mt-1">
                    <strong>24–48 hours on weekdays</strong> (Monday to Friday)
                  </p>
                  <p className="text-xs text-slate-600 mt-2">
                    Urgent operational issues may receive faster response. Weekend support is available for critical system failures. Business hours: Mon–Fri 08:30–17:00, Sat 09:00–12:00.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-6 text-2xl font-bold text-slate-900">Troubleshooting Guide</h2>
            <p className="mb-6 text-slate-700">
              Before contacting support, try these troubleshooting steps for common issues:
            </p>
            <div className="space-y-4">
              {troubleshooting.map((category) => {
                const IconComponent = category.icon;
                const isExpanded = expandedFAQ === category.id;
                return (
                  <div key={category.id} className="border border-slate-200 rounded-lg overflow-hidden hover:border-slate-300 transition-colors">
                    <button
                      onClick={() => setExpandedFAQ(isExpanded ? null : category.id)}
                      className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <IconComponent className="h-5 w-5 flex-shrink-0 text-orange-600" />
                        <span className="font-semibold text-slate-900">{category.title}</span>
                      </div>
                      <span className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                        ▼
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
                        <ul className="space-y-2">
                          {category.items.map((item, idx) => (
                            <li key={idx} className="flex gap-3 text-sm text-slate-700">
                              <span className="text-orange-600 font-bold flex-shrink-0">✓</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="mb-6 text-2xl font-bold text-slate-900">Escalation & Critical Issues</h2>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-slate-900">Urgent Operational Issues</h3>
                  <p className="text-sm text-slate-700 mt-1">
                    If you experience critical system outages, data loss, or security concerns:
                  </p>
                  <ol className="list-inside list-decimal space-y-1 text-sm text-slate-700 mt-2">
                    <li>Contact us immediately via phone: <strong>+49 5222 8504-90</strong></li>
                    <li>Mark your email subject as "[URGENT]" for fast escalation</li>
                    <li>Provide detailed description of the issue and steps to reproduce</li>
                  </ol>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-6 text-2xl font-bold text-slate-900">About Your Data & Privacy</h2>
            <p className="mb-4 text-slate-700">
              For questions about how we collect, process, and protect your personal data, please refer to our comprehensive Privacy Policy:
            </p>
            <Link
              to="/privacy-policy"
              className="inline-flex items-center gap-2 rounded-lg bg-orange-50 px-4 py-2 font-medium text-orange-600 hover:bg-orange-100 transition-colors"
            >
              Read Privacy Policy
              <ExternalLink className="h-4 w-4" />
            </Link>
          </section>

          <section className="rounded-lg border border-slate-200 bg-slate-50 p-6">
            <h3 className="mb-4 font-semibold text-slate-900">Company Information</h3>
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                <strong>Liftpictures Fotosysteme</strong>
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
                <span>Lehmkuhlstr. 18, 32108 Bad Salzuflen, Germany</span>
              </p>
              <p className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
                <span>+49 5222 8504-90</span>
              </p>
              <p className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
                <a href="mailto:info@liftpictures.com" className="font-medium text-orange-600 hover:text-orange-700">
                  info@liftpictures.com
                </a>
              </p>
              <p className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
                <span>Mon–Fri 08:30–17:00, Sat 09:00–12:00 (Service)</span>
              </p>
              <p className="mt-2 text-xs">
                Register Court: Amtsgericht Lemgo | Register Number: HRB 6664
                <br />
                VAT ID: DE814667627
              </p>
            </div>
          </section>
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-4 text-sm">
          <Link
            to="/privacy-policy"
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
          >
            Privacy Policy
          </Link>
          <Link
            to="/login"
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
          >
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

function MapPin(props: any) {
  return <MapPin {...props} />;
}
