import { MessageSquare } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  buildFeedbackContext,
  isFeedbackWidgetConfigured,
  loadFeedbackWidget,
  openFeedbackWidget,
  unloadFeedbackWidget,
} from '../lib/feedback-widget';
import {
  getStoredConsent,
  isAnalyticsEnabled,
  subscribeConsent,
  trackEvent,
  type ConsentState,
} from '../lib/telemetry';

/**
 * The floating "Feedback" button, and the only thing that loads the product
 * feedback widget.
 *
 * Four conditions have to hold before a single byte of third-party script is
 * fetched, and each of them is a requirement rather than a preference:
 *
 * 1. **A provider key is configured.** Unset is normal; the app is unchanged.
 * 2. **Analytics consent is granted** — the same `isAnalyticsEnabled()` +
 *    `getStoredConsent()` gate GA4 goes through. Withdrawing consent tears the
 *    widget back down rather than just hiding the button.
 * 3. **Someone is signed in.** The goal is feedback from users, not from
 *    anonymous visitors, and the landing page is the page #71 is cutting
 *    weight from — so it must not gain a third-party connection.
 * 4. **This is not a review session.** A floating button mid-review is a
 *    distraction, and `/review` already suppresses the edge-swipe gesture for
 *    the same reason.
 *
 * The script itself is fetched at the next idle moment (see
 * `lib/feedback-widget.ts`), so it never competes with the first render.
 */
export function ProductFeedbackTrigger({ signedIn }: { signedIn: boolean }) {
  const { pathname } = useLocation();
  const [consent, setConsent] = useState<ConsentState>(() => getStoredConsent());

  // Accepting the banner must reveal the trigger there and then; consent is a
  // localStorage read, so nothing else would re-render.
  useEffect(() => subscribeConsent(setConsent), []);

  const allowed = consent === 'granted' && isAnalyticsEnabled() && isFeedbackWidgetConfigured();
  const visible = allowed && signedIn && !isReviewRoute(pathname);

  // Read at open time by the vendor callback, which outlives this render.
  const contextRef = useRef({ pathname, signedIn });
  contextRef.current = { pathname, signedIn };

  useEffect(() => {
    if (!visible) return;
    loadFeedbackWidget({
      getContext: () => buildFeedbackContext(contextRef.current.pathname, contextRef.current.signedIn),
      onOpen: () => trackEvent('product_feedback_open'),
      onSubmit: () => trackEvent('product_feedback_submit'),
    });
  }, [visible]);

  // Consent withdrawn, or the session ended: remove the widget, not just the
  // button. Signing out is the other case a loaded third party should not
  // survive.
  useEffect(() => {
    if (allowed && signedIn) return;
    unloadFeedbackWidget();
  }, [allowed, signedIn]);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => openFeedbackWidget()}
      className="vb-feedback-trigger flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-surface-700/80 bg-surface-900/95 px-3.5 text-sm font-semibold text-surface-200 shadow-lg shadow-black/20 backdrop-blur-md hover:bg-surface-800 hover:text-surface-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <MessageSquare aria-hidden className="size-4 shrink-0 text-accent-indigo" />
      {/* Visible from `sm` up, screen-reader-only below it — so the accessible
          name is "Feedback" at every width, and never an icon with no name. */}
      <span className="sr-only sm:not-sr-only">Feedback</span>
    </button>
  );
}

/** `/review` and anything nested under it. */
function isReviewRoute(pathname: string): boolean {
  return pathname === '/review' || pathname.startsWith('/review/');
}
