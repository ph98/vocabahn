import * as Sentry from '@sentry/react';
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

export type ConsentState = 'granted' | 'denied' | 'pending';

const CONSENT_KEY = 'vocabahn_consent';

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
}

/** Track SPA virtual page views in GA4. */
export function trackPageView(pathname: string, title?: string) {
  if (getStoredConsent() !== 'granted' || !isAnalyticsEnabled()) return;

  if (typeof window.gtag === 'function') {
    window.gtag('event', 'page_view', {
      page_path: pathname,
      page_title: title || document.title,
    });
  }
}

/** Track custom user interaction and learning progression events. */
export function trackEvent(eventName: string, params: Record<string, unknown> = {}) {
  if (getStoredConsent() !== 'granted' || !isAnalyticsEnabled()) return;

  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }
}

/** Track client-side exceptions in Sentry. */
export function trackError(error: Error | unknown, context?: Record<string, unknown>) {
  if (import.meta.env.VITE_SENTRY_DSN && isAnalyticsEnabled()) {
    Sentry.captureException(error, { extra: context });
  }
}
