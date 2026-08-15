import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getStoredConsent, setStoredConsent, type ConsentState } from '../lib/telemetry';

/**
 * The consent banner every first-time visitor sees.
 *
 * Its entrance is the CSS `.vb-rise-in` in `index.css`. It used to be a
 * `gsap.fromTo`, and because this component is mounted unconditionally at the
 * top of `App.tsx`, that single import was on its own enough to keep ~237 kB of
 * GSAP source in the entry chunk — on the critical path of a page that shows
 * the banner for a quarter of a second and never animates again.
 */
export function CookieConsentBanner() {
  const [consentState, setConsentState] = useState<ConsentState>('granted');

  useEffect(() => {
    setConsentState(getStoredConsent());
  }, []);

  if (consentState !== 'pending') {
    return null;
  }

  const handleAccept = () => {
    setStoredConsent('granted');
    setConsentState('granted');
  };

  const handleDecline = () => {
    setStoredConsent('denied');
    setConsentState('denied');
  };

  return (
    <div
      role="region"
      aria-label="Cookie and Privacy Consent"
      className="vb-rise-in fixed bottom-4 inset-x-4 z-50 mx-auto max-w-2xl rounded-2xl border border-surface-700/80 bg-surface-900/95 p-5 shadow-2xl backdrop-blur-xl md:bottom-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-sm">
          <p className="font-semibold text-surface-100">Privacy & Analytics</p>
          <p className="text-surface-300 leading-relaxed text-xs">
            We use privacy-focused analytics, error tracking, and — once you are signed in — a feedback button that
            sends a report only when you press send. No session recording, no heatmaps, and no data shared with third
            parties for advertising. Read our{' '}
            <Link
              to="/privacy"
              className="font-medium text-accent-indigo underline underline-offset-2 hover:text-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleDecline}
            className="min-h-10 rounded-xl border border-surface-700 bg-surface-800/80 px-3.5 text-xs font-medium text-surface-300 transition-colors hover:bg-surface-700 hover:text-surface-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo"
          >
            Essential Only
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="min-h-10 rounded-xl bg-indigo-500 px-4 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
