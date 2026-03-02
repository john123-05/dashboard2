import { Mail, MapPin, Phone, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-12 lg:py-16">
        <div className="mb-12 text-center">
          <h1 className="mb-2 text-4xl font-bold tracking-tight text-slate-900">
            Privacy Policy
          </h1>
          <p className="text-sm text-slate-500">
            Last updated: March 2, 2026
          </p>
        </div>

        <div className="space-y-8 rounded-2xl bg-white p-8 shadow-sm lg:p-12">
          <section>
            <h2 className="mb-4 text-2xl font-bold text-slate-900">1. Data Controller</h2>
            <p className="mb-4 text-slate-700">
              The data controller responsible for your personal data is:
            </p>
            <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold">Liftpictures Fotosysteme</p>
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
                <span>Lehmkuhlstr. 18, 32108 Bad Salzuflen, Germany</span>
              </div>
              <div className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
                <span>+49 5222 8504-90</span>
              </div>
              <div className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
                <a href="mailto:info@liftpictures.com" className="font-medium text-orange-600 hover:text-orange-700">
                  info@liftpictures.com
                </a>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
                <span>Mon–Fri 08:30–17:00, Sat 09:00–12:00</span>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold text-slate-900">2. What Data We Collect</h2>
            <p className="mb-4 text-slate-700">
              We collect the following types of personal data:
            </p>
            <ul className="space-y-3 text-slate-700">
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Account Data:</strong> Email address, password (hashed), full name, and profile information
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Usage Data:</strong> Dashboard interactions, feature usage patterns, parks accessed, and operational events
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Purchase & Transaction Data:</strong> Payment information processed through Stripe (we do not store full credit card details)
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Device & Notification Data:</strong> Push notification tokens, device identifiers, app version, and operating system information
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Support Data:</strong> Messages, tickets, and communications with our support team
                </div>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold text-slate-900">3. Why We Use Your Data</h2>
            <p className="mb-4 text-slate-700">
              We process your personal data for the following purposes:
            </p>
            <ul className="space-y-3 text-slate-700">
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Service Operation:</strong> To provide, maintain, and operate the Liftpictures Operator Dashboard
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Authentication:</strong> To authenticate your identity and secure your account
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Analytics & Improvement:</strong> To understand usage patterns, improve features, and enhance the user experience
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Push Notifications:</strong> To send you alerts, updates, and operational information
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Customer Support:</strong> To respond to inquiries, troubleshoot issues, and provide technical assistance
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Legal Compliance:</strong> To comply with applicable laws, regulations, and legal obligations
                </div>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold text-slate-900">4. Third-Party Processors</h2>
            <p className="mb-4 text-slate-700">
              We share your data with the following trusted third-party service providers:
            </p>
            <ul className="space-y-3 text-slate-700">
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Supabase:</strong> Database and authentication provider. Processes account data, usage logs, and application data. Located in the EU.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Stripe:</strong> Payment processor. Handles all payment information according to PCI-DSS standards. We do not store full card details.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Expo Notifications:</strong> Push notification service. Stores and processes notification tokens and device metadata.
                </div>
              </li>
            </ul>
            <p className="mt-4 text-slate-700">
              All processors are bound by data processing agreements and comply with GDPR requirements.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold text-slate-900">5. Data Retention</h2>
            <p className="mb-4 text-slate-700">
              We retain your personal data as follows:
            </p>
            <ul className="space-y-3 text-slate-700">
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Active Account Data:</strong> Retained for the duration of your account and 6 months after account deletion for compliance purposes
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Usage Analytics:</strong> Aggregated and anonymized usage data is retained for up to 24 months for service improvement
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Support Records:</strong> Retained for 12 months after the last interaction
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Payment Data:</strong> Retained according to applicable tax and accounting laws (typically 7–10 years)
                </div>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold text-slate-900">6. Your Rights</h2>
            <p className="mb-4 text-slate-700">
              Under the GDPR and applicable data protection laws, you have the right to:
            </p>
            <ul className="space-y-3 text-slate-700">
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Access:</strong> Request a copy of your personal data
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Correction:</strong> Request correction of inaccurate or incomplete data
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Deletion:</strong> Request deletion of your personal data ("right to be forgotten")
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Portability:</strong> Request your data in a structured, machine-readable format
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Objection:</strong> Object to certain types of data processing (e.g., analytics)
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                  •
                </span>
                <div>
                  <strong>Restriction:</strong> Request restrictions on how your data is processed
                </div>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold text-slate-900">7. Account & Data Deletion</h2>
            <p className="mb-4 text-slate-700">
              You can delete your account and associated data in two ways:
            </p>
            <div className="space-y-4">
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                <h3 className="mb-2 font-semibold text-slate-900">In-App Deletion:</h3>
                <p className="text-sm text-slate-700">
                  Visit your Settings page and select "Delete Account". This will permanently remove your account and associated data.
                </p>
              </div>
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                <h3 className="mb-2 font-semibold text-slate-900">Email Request:</h3>
                <p className="text-sm text-slate-700">
                  Contact us at{' '}
                  <a href="mailto:info@liftpictures.com" className="font-medium text-orange-600 hover:text-orange-700">
                    info@liftpictures.com
                  </a>{' '}
                  with the subject "Data Deletion Request" and include your email address. We will process your request within 30 days.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold text-slate-900">8. Data Security</h2>
            <p className="mb-4 text-slate-700">
              We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction. These include:
            </p>
            <ul className="space-y-2 text-slate-700">
              <li className="flex gap-3">
                <span className="text-orange-600">•</span>
                <span>SSL/TLS encryption for data in transit</span>
              </li>
              <li className="flex gap-3">
                <span className="text-orange-600">•</span>
                <span>Encrypted storage of sensitive data at rest</span>
              </li>
              <li className="flex gap-3">
                <span className="text-orange-600">•</span>
                <span>Access controls and authentication mechanisms</span>
              </li>
              <li className="flex gap-3">
                <span className="text-orange-600">•</span>
                <span>Regular security audits and monitoring</span>
              </li>
            </ul>
            <p className="mt-4 text-slate-700">
              However, no security measure is completely foolproof. We cannot guarantee absolute security of your data.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold text-slate-900">9. International Data Transfers</h2>
            <p className="text-slate-700">
              Your data is primarily processed within the European Union. Where transfers outside the EU/EEA occur, we ensure appropriate safeguards, such as Standard Contractual Clauses, are in place.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold text-slate-900">10. Contact & Data Subject Rights Requests</h2>
            <p className="mb-4 text-slate-700">
              If you wish to exercise any of your data protection rights or have questions about this Privacy Policy, please contact us:
            </p>
            <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold">Liftpictures Fotosysteme</p>
              <p>
                <strong>Email:</strong>{' '}
                <a href="mailto:info@liftpictures.com" className="font-medium text-orange-600 hover:text-orange-700">
                  info@liftpictures.com
                </a>
              </p>
              <p>
                <strong>Phone:</strong> +49 5222 8504-90
              </p>
              <p className="mt-2 text-xs">
                We aim to respond to all requests within 30 days. If we cannot comply with your request, we will explain why.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold text-slate-900">11. Legal Basis for Processing</h2>
            <p className="mb-4 text-slate-700">
              We process your personal data on the basis of:
            </p>
            <ul className="space-y-2 text-slate-700">
              <li className="flex gap-3">
                <span className="text-orange-600">•</span>
                <span><strong>Contractual Necessity:</strong> To fulfill our service obligations</span>
              </li>
              <li className="flex gap-3">
                <span className="text-orange-600">•</span>
                <span><strong>Your Consent:</strong> For optional features like analytics and marketing communications</span>
              </li>
              <li className="flex gap-3">
                <span className="text-orange-600">•</span>
                <span><strong>Legal Obligation:</strong> To comply with laws, regulations, and legal processes</span>
              </li>
              <li className="flex gap-3">
                <span className="text-orange-600">•</span>
                <span><strong>Legitimate Interests:</strong> To improve our service and protect against fraud</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold text-slate-900">12. Changes to This Policy</h2>
            <p className="text-slate-700">
              We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. We will notify you of significant changes by email or by posting the updated policy on our website. Your continued use of the service after changes constitute your acceptance of the updated Privacy Policy.
            </p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-600">
              <strong>Company Information:</strong>
              <br />
              Liftpictures Fotosysteme
              <br />
              Register Court: Amtsgericht Lemgo
              <br />
              Register Number: HRB 6664
              <br />
              VAT ID: DE814667627
            </p>
          </section>
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-4 text-sm">
          <Link
            to="/support"
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
          >
            Support
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
