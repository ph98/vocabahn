import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Cookie, Database, Lock, Server, ShieldCheck, UserCheck } from 'lucide-react';
import { getStoredConsent, setStoredConsent, type ConsentState } from '../lib/telemetry';

export function PrivacyPage() {
  const [consent, setConsent] = useState<ConsentState>('denied');

  useEffect(() => {
    setConsent(getStoredConsent());
  }, []);

  const handleToggleConsent = (granted: boolean) => {
    const newState = granted ? 'granted' : 'denied';
    setStoredConsent(newState);
    setConsent(newState);
  };

  return (
    <article className="w-full max-w-4xl mx-auto py-6 px-4 sm:px-6">
      {/* Navigation Header */}
      <div className="mb-8 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-800/60 hover:bg-surface-800 text-surface-200 text-sm font-medium transition-colors border border-surface-700/50"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>Back to Vocabahn</span>
        </Link>
        <span className="text-xs text-surface-400 font-mono">Last updated: July 2026</span>
      </div>

      {/* Main Glassmorphic Card */}
      <div className="relative overflow-hidden rounded-[2.5rem] border border-surface-800/80 bg-surface-900/80 p-8 md:p-12 shadow-2xl backdrop-blur-2xl">
        {/* Background Ambient Glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent-emerald/10 rounded-full blur-[120px] pointer-events-none" aria-hidden="true" />

        {/* Hero Section */}
        <header className="mb-10 pb-8 border-b border-surface-800/80">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-emerald-500/10 text-accent-emerald border border-emerald-500/20 mb-4">
            <ShieldCheck className="size-8" aria-hidden="true" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-surface-100">
            Privacy Policy
          </h1>
          <p className="mt-3 text-base md:text-lg text-surface-300 max-w-2xl leading-relaxed">
            Your privacy is fundamental to Vocabahn. This policy explains what information we collect, how it is stored, and your rights under privacy laws such as GDPR.
          </p>
        </header>

        {/* Interactive Consent Settings Card */}
        <section className="mb-10 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-surface-100 flex items-center gap-2">
            <Cookie className="size-5 text-accent-amber shrink-0" aria-hidden="true" />
            <span>Your Cookie & Analytics Preferences</span>
          </h2>
          <p className="text-sm text-surface-300 leading-relaxed">
            You can update your analytics preference at any time. We support Google Consent Mode v2 to ensure no non-essential telemetry runs unless explicit consent is given.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-indigo-500/20">
            <div>
              <span className="text-sm font-medium">Analytics & Performance Tracking: </span>
              <span className={`text-sm font-bold ${consent === 'granted' ? 'text-accent-emerald' : 'text-accent-amber'}`}>
                {consent === 'granted' ? 'Enabled (Granted)' : 'Disabled (Denied)'}
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleToggleConsent(false)}
                className={`min-h-10 rounded-xl px-3.5 text-xs font-medium transition-colors ${
                  consent === 'denied'
                    ? 'bg-surface-700 text-white font-semibold'
                    : 'border border-surface-700 bg-surface-800/60 text-surface-400 hover:text-white'
                }`}
              >
                Deny
              </button>
              <button
                type="button"
                onClick={() => handleToggleConsent(true)}
                className={`min-h-10 rounded-xl px-4 text-xs font-semibold transition-colors ${
                  consent === 'granted'
                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
                    : 'border border-surface-700 bg-surface-800/60 text-surface-300 hover:text-white'
                }`}
              >
                Grant Consent
              </button>
            </div>
          </div>
        </section>

        {/* Content Sections */}
        <div className="space-y-10 text-surface-300 leading-relaxed text-sm md:text-base">
          {/* Section 1 */}
          <section aria-labelledby="privacy-overview">
            <div className="flex items-center gap-3 mb-3 text-surface-100 font-bold text-lg">
              <Lock className="size-5 text-accent-emerald shrink-0" aria-hidden="true" />
              <h2 id="privacy-overview">1. Data Protection Overview</h2>
            </div>
            <p>
              Vocabahn operates under principles of data minimization and privacy-by-design. We only store information required to deliver personalized vocabulary learning, maintain secure authentication, and track your study progress.
            </p>
          </section>

          {/* Section 2 */}
          <section aria-labelledby="privacy-collection">
            <div className="flex items-center gap-3 mb-3 text-surface-100 font-bold text-lg">
              <UserCheck className="size-5 text-accent-indigo shrink-0" aria-hidden="true" />
              <h2 id="privacy-collection">2. Information We Collect</h2>
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-surface-200 mb-1">Account & Identity Information</h3>
                <p className="text-surface-400">
                  When you sign in using Google OAuth or email magic links, we store your email address, display name, and avatar URL to identify your profile.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-surface-200 mb-1">Learning History & Review Logs</h3>
                <p className="text-surface-400">
                  To calculate FSRS spaced-repetition schedules, we store your card ratings, review timestamps, study streaks, CEFR level selection, and custom deck contents.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section aria-labelledby="privacy-cookies">
            <div className="flex items-center gap-3 mb-3 text-surface-100 font-bold text-lg">
              <Cookie className="size-5 text-accent-amber shrink-0" aria-hidden="true" />
              <h2 id="privacy-cookies">3. Cookies & Local Storage</h2>
            </div>
            <p className="mb-3">
              Vocabahn uses technical cookies and browser storage strictly necessary for authentication and preferences:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-surface-400">
              <li><strong><code>vb_access</code> HTTP-Only Cookie:</strong> Secure, encrypted JWT token used solely to maintain signed-in sessions.</li>
              <li><strong>Local Storage:</strong> Remembers your preferred UI color theme (Light/Dark/System) and offline review cache.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section aria-labelledby="privacy-providers">
            <div className="flex items-center gap-3 mb-3 text-surface-100 font-bold text-lg">
              <Server className="size-5 text-accent-indigo shrink-0" aria-hidden="true" />
              <h2 id="privacy-providers">4. Third-Party AI & Media Infrastructure</h2>
            </div>
            <p className="mb-3">
              To enrich German vocabulary entries, Vocabahn integrates with third-party service providers:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-surface-400">
              <li><strong>Google Gemini AI:</strong> Used to generate translations, CEFR levels, and mnemonics for vocabulary words.</li>
              <li><strong>ElevenLabs & Google TTS:</strong> Used to synthesize pronunciation audio files.</li>
              <li><strong>Unsplash API:</strong> Used to display dictionary illustration images.</li>
            </ul>
            <p className="mt-3">
              <em>Note:</em> Personal user account data (such as user names, emails, or review histories) is <strong>never</strong> transmitted to third-party AI providers when generating vocabulary enrichments.
            </p>
          </section>

          {/* Section 5 */}
          <section aria-labelledby="privacy-rights">
            <div className="flex items-center gap-3 mb-3 text-surface-100 font-bold text-lg">
              <Database className="size-5 text-accent-emerald shrink-0" aria-hidden="true" />
              <h2 id="privacy-rights">5. Your Data Rights (GDPR)</h2>
            </div>
            <p className="mb-3">
              Under GDPR and international privacy standards, you hold full control over your personal data:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-surface-400">
              <li><strong>Right to Access & Export:</strong> You can view your full study logs and profile details at any time.</li>
              <li><strong>Right to Deletion:</strong> You may request complete deletion of your account and review history.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section aria-labelledby="privacy-contact">
            <div className="flex items-center gap-3 mb-3 text-surface-100 font-bold text-lg">
              <ShieldCheck className="size-5 text-surface-400 shrink-0" aria-hidden="true" />
              <h2 id="privacy-contact">6. Contact & Data Requests</h2>
            </div>
            <p>
              For any privacy-related requests or questions regarding data processing, please visit our open-source GitHub repository at{' '}
              <a
                href="https://github.com/ph98/vocabahn"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-indigo hover:underline font-medium"
              >
                github.com/ph98/vocabahn
              </a>.
            </p>
          </section>
        </div>
      </div>
    </article>
  );
}
