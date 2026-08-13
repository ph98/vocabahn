/**
 * Keeping synthetic traffic out of the product's analytics.
 *
 * A monitoring account signing in every half hour, searching the same word and
 * rating the same card, would otherwise become one of the most engaged users on
 * the property and quietly skew every retention number.
 *
 * Two layers, because either alone can lapse. `initGA4` refuses to inject the
 * tag unless `vocabahn_consent` is `granted` (`apps/web/src/lib/telemetry.ts`),
 * so seeding a denial keeps the script from ever loading. The route blocks are
 * the backstop: if consent handling changes, the beacons still never leave the
 * browser.
 */
import type { BrowserContext } from '@playwright/test';

/** Hosts a monitoring run must never talk to. */
const ANALYTICS_HOSTS = [
  '**://*.googletagmanager.com/**',
  '**://*.google-analytics.com/**',
  '**://*.analytics.google.com/**',
  '**://*.doubleclick.net/**',
  '**://*.ingest.sentry.io/**',
  '**://*.ingest.de.sentry.io/**',
  '**://*.ingest.us.sentry.io/**',
];

/**
 * Applies to every page opened on `context`, including ones opened by a
 * redirect, so a sign-in bounce through the API cannot slip a page view out.
 */
export async function excludeFromAnalytics(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('vocabahn_consent', 'denied');
    } catch {
      // Storage is unavailable on about:blank and on opaque origins.
    }
  });

  for (const pattern of ANALYTICS_HOSTS) {
    await context.route(pattern, (route) => route.abort());
  }
}
