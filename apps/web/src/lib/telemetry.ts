import * as Sentry from '@sentry/react';
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import type {
  AnalyticsEventArgs,
  AnalyticsEventName,
  LoginMethod,
} from './analytics-events';

export type ConsentState = 'granted' | 'denied' | 'pending';

const CONSENT_KEY = 'vocabahn_consent';

/**
 * A redirect sign-in that left the page. Session-scoped so it dies with the
 * tab, and only ever written once consent is granted.
 */
const PENDING_LOGIN_KEY = 'vocabahn_pending_login';

/** Set once the learner has completed a review session in this browser. */
const FIRST_REVIEW_KEY = 'vocabahn_first_review_done';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Check if analytics are enabled in the current environment. */
export function isAnalyticsEnabled(): boolean {
  const isDevOrTest =
    import.meta.env.MODE === 'development' ||
    import.meta.env.MODE === 'test' ||
    import.meta.env.DEV ||
    typeof window === 'undefined' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  return !isDevOrTest;
}

/** Retrieve current user consent state from localStorage. */
export function getStoredConsent(): ConsentState {
  if (typeof localStorage === 'undefined') return 'pending';
  const val = localStorage.getItem(CONSENT_KEY);
  if (val === 'granted' || val === 'denied') return val;
  return 'pending';
}

/**
 * True when GA4 may be given anything at all: the environment is one where
 * analytics run, and the visitor has actively granted consent. Every write to
 * gtag and every analytics-only storage key goes through this.
 */
export function isAnalyticsAllowed(): boolean {
  return isAnalyticsEnabled() && getStoredConsent() === 'granted';
}

/**
 * Route paths whose dynamic segment is the learner's own data. `/word/Haus`
 * names a word someone is studying and `/decks/<cuid>` names one of their
 * objects; neither may reach GA4, in `page_path` or in the `page_location`
 * gtag would otherwise collect from `window.location` on every single hit.
 */
const PATH_REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/word\/.+$/, '/word/:word'],
  [/^\/decks\/[^/]+$/, '/decks/:id'],
];

/**
 * Reduces a path to something safe to report: dynamic segments carrying user
 * data become placeholders. Course slugs are left alone — they name public
 * catalogue content, not the learner.
 */
export function redactPagePath(pathname: string): string {
  for (const [pattern, replacement] of PATH_REDACTIONS) {
    if (pattern.test(pathname)) return replacement;
  }
  return pathname;
}

/**
 * The absolute URL to report, with the query string dropped (the dictionary
 * search term lives in `?q=`) and the path redacted.
 */
function redactedPageLocation(pathname: string): string {
  if (typeof window === 'undefined') return redactPagePath(pathname);
  return `${window.location.origin}${redactPagePath(pathname)}`;
}

let gaInitialized = false;

/** Dynamically inject GA4 script if consent granted and environment is production. */
export function initGA4() {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (!measurementId || gaInitialized || !isAnalyticsEnabled()) return;

  const consent = getStoredConsent();
  if (consent !== 'granted') return;

  gaInitialized = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };

  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    send_page_view: false, // Managed manually via SPA route transitions
    anonymize_ip: true,
    // Without this, gtag reads window.location.href itself and every hit
    // carries the un-redacted path and query string.
    page_location: redactedPageLocation(window.location.pathname),
  });
}

/** Set and persist consent state; update Google Consent Mode v2. */
export function setStoredConsent(consent: 'granted' | 'denied') {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(CONSENT_KEY, consent);
  }

  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      analytics_storage: consent,
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }

  if (consent === 'granted') {
    initGA4();
  }
}

/** Initialize telemetry systems (GA4 Consent Mode, Sentry, Web Vitals). */
export function initTelemetry() {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };

  // Google Consent Mode v2 Default State
  const initialConsent = getStoredConsent();
  window.gtag('consent', 'default', {
    analytics_storage: initialConsent === 'granted' ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });

  // Initialize GA4 if already consented
  if (initialConsent === 'granted') {
    initGA4();
  }

  // Initialize Sentry Frontend Error Monitoring
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (dsn && isAnalyticsEnabled()) {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      integrations: [
        Sentry.browserTracingIntegration(),
      ],
      tracesSampleRate: 0.2,
      // Ensure sensitive PII is stripped
      beforeSend(event) {
        if (event.request?.cookies) delete event.request.cookies;
        return event;
      },
    });
  }

  // Web Vitals Performance Monitoring
  if (isAnalyticsEnabled()) {
    const handleMetric = (metric: Metric) => {
      trackEvent('web_vitals', {
        metric_name: metric.name,
        metric_value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
        metric_rating: metric.rating,
      });
    };

    onLCP(handleMetric);
    onINP(handleMetric);
    onCLS(handleMetric);
    onFCP(handleMetric);
    onTTFB(handleMetric);
  }

  // The browser reports this once, whenever the PWA is added to the home
  // screen; there is no other moment the app could observe an install.
  window.addEventListener('appinstalled', () => trackEvent('pwa_install'));
}

/** Track SPA virtual page views in GA4. */
export function trackPageView(pathname: string, title?: string) {
  if (!isAnalyticsAllowed()) return;

  if (typeof window.gtag === 'function') {
    const page_path = redactPagePath(pathname);
    const page_location = redactedPageLocation(pathname);
    const page_title = title || document.title;
    // `set` makes the redacted location stick for every subsequent event, not
    // just this page_view; otherwise gtag re-reads window.location each hit.
    window.gtag('set', { page_path, page_location, page_title });
    window.gtag('event', 'page_view', { page_path, page_location, page_title });
  }
}

/**
 * Send one event from the taxonomy in `./analytics-events`.
 *
 * The name and parameter shape are checked against `AnalyticsEventMap`, so a
 * typo or a payload that disagrees with another call site of the same event is
 * a compile error. Nothing is sent unless analytics are enabled for this
 * environment *and* the visitor granted consent.
 */
export function trackEvent<K extends AnalyticsEventName>(
  eventName: K,
  ...args: AnalyticsEventArgs<K>
) {
  if (!isAnalyticsAllowed()) return;

  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, args[0] ?? {});
  }
}

/**
 * Remember that a redirect sign-in is in flight, so the load that comes back
 * can report `login`. Google OAuth and the magic link both hand off to the API
 * with a full-page navigation, which is the only reason this indirection
 * exists — `sessionStorage` survives that navigation within the same tab.
 */
export function markPendingLogin(method: Extract<LoginMethod, 'google' | 'email_link'>) {
  if (!isAnalyticsAllowed()) return;
  try {
    sessionStorage.setItem(PENDING_LOGIN_KEY, method);
  } catch {
    // Private-mode storage refusal must never break a sign-in.
  }
}

/**
 * Report `login` if this tab is returning from a redirect sign-in that has now
 * produced a session. Idempotent: the marker is consumed on the first call.
 */
export function flushPendingLogin() {
  let method: string | null;
  try {
    method = sessionStorage.getItem(PENDING_LOGIN_KEY);
    if (method !== null) sessionStorage.removeItem(PENDING_LOGIN_KEY);
  } catch {
    return;
  }
  if (method === 'google' || method === 'email_link') {
    trackEvent('login', { method });
  }
}

/**
 * True the first time a review session is completed in this browser, false
 * every time after. Writes nothing unless analytics are allowed, so a visitor
 * who declined consent gets no analytics-only storage key.
 *
 * Device-scoped rather than account-scoped: the API exposes no lifetime review
 * count, and GA4's own attribution is cookie-scoped anyway.
 */
export function isFirstReviewSession(): boolean {
  if (!isAnalyticsAllowed()) return false;
  try {
    if (localStorage.getItem(FIRST_REVIEW_KEY)) return false;
    localStorage.setItem(FIRST_REVIEW_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Track client-side exceptions in Sentry. Returns the event id when one was
 * actually sent, so an error page can show a reference a support request can
 * be matched against. Undefined when Sentry is not configured for this build.
 */
export function trackError(error: Error | unknown, context?: Record<string, unknown>): string | undefined {
  if (import.meta.env.VITE_SENTRY_DSN && isAnalyticsEnabled()) {
    return Sentry.captureException(error, { extra: context });
  }
  return undefined;
}
