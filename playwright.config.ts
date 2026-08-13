import { defineConfig, devices } from '@playwright/test';

/**
 * Two audiences share this suite.
 *
 * The default projects (`chromium`, `mobile-safari`) are the PR check. They
 * stub `/api/v1/auth/me` and friends so they run in seconds against a local
 * Vite dev server with no API, no database, and no account. They are fast and
 * hermetic, and they are worthless as monitoring: pointed at production they
 * pass while the API is down, because they never call it.
 *
 * The `monitor` project is the opposite trade. It mocks nothing, signs in for
 * real through an email magic link, and is meant to be pointed at a deployed
 * environment via `E2E_BASE_URL`. Everything it needs lives in `e2e/monitor/`
 * and carries the `@monitor` tag; `grep`/`grepInvert` keep the two sets from
 * ever running in the wrong context.
 */
const MONITOR_TAG = /@monitor/;

/**
 * Set when the suite targets a deployed environment rather than a local dev
 * server.
 *
 * `|| undefined`, not `??`: the workflow passes `E2E_BASE_URL: ${{ inputs.base-url }}`,
 * which is the **empty string** for the mocked jobs that have no remote target.
 * An empty string is not nullish, so `??` let it through as the `baseURL` and
 * every mocked spec failed with "Cannot navigate to invalid URL".
 */
const remoteTarget = process.env.E2E_BASE_URL || undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Never parallel against a deployed environment: the whole suite shares one
  // monitoring account and one per-IP auth rate limit, and two workers spend
  // that budget twice as fast (`e2e/support/auth-throttle.ts`).
  workers: process.env.CI || remoteTarget ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: remoteTarget ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', grepInvert: MONITOR_TAG, use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', grepInvert: MONITOR_TAG, use: { ...devices['iPhone 14'] } },
    {
      name: 'monitor',
      grep: MONITOR_TAG,
      // One shared monitoring account per environment: parallel sign-ins would
      // invalidate each other's magic links (`requestEmailOtp` expires the
      // previous unused OTP for an address).
      fullyParallel: false,
      // One retry, not two. Retrying absorbs a redeploy landing mid-run; a
      // second retry starts hiding a failure that reproduces one time in three,
      // and each attempt costs another sign-in and two throttle windows.
      retries: process.env.CI ? 1 : 0,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Only boot a local dev server when there is nothing deployed to point at.
  // Starting Vite in front of staging or production would serve the wrong build
  // and quietly test the wrong thing.
  webServer: remoteTarget
    ? undefined
    : {
        command: 'pnpm --filter @vocabahn/web dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
