/**
 * Landing / auth entry points, signed out.
 *
 * Nothing here signs anyone in — the sign-in *button* is all this file can
 * reach without a backend. Real sign-in is asserted in
 * `e2e/monitor/session.spec.ts`, against a live deployment.
 */
import { expect, test } from '@playwright/test';
import { json, mockHealth } from './support/fixtures';

test.describe('Landing page (signed out)', () => {
  test.beforeEach(async ({ page }) => {
    // Answer as a real API would for a visitor with no cookie, rather than
    // leaving the calls to fail against a dev server with no backend behind it.
    // "Signed out" and "the API is unreachable" are different states the app is
    // entitled to render differently, and this spec is about the first one.
    const unauthorized = (route: import('@playwright/test').Route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 401, message: 'Unauthorized' }),
      });

    await page.route('**/api/v1/auth/me', unauthorized);
    await page.route('**/api/v1/auth/refresh', unauthorized);
    await page.route('**/api/v1/auth/config', (route) => route.fulfill(json({ googleClientId: null })));
    await page.route('**/api/v1/health', (route) => route.fulfill(json(mockHealth)));
  });

  test('shows app name, tagline, and sign-in options', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /vocabahn/i })).toBeVisible();
    await expect(page.getByText(/german vocabulary/i)).toBeVisible();
    // An anchor, not a button: it has to be a real navigation so the browser
    // follows the API's OAuth redirect (see `SignInOptions`).
    await expect(page.getByRole('link', { name: /sign in with google/i })).toBeVisible();
  });

  test('sign-in link points at the Google OAuth endpoint', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('link', { name: /sign in with google/i })).toHaveAttribute(
      'href',
      /\/api\/v1\/auth\/google/,
    );
  });

  test('offers the email magic-link form as a second path', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByPlaceholder('name@example.com')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send Magic Link' })).toBeVisible();
  });

  test('has no obvious accessibility violations on load', async ({ page }) => {
    await page.goto('/');
    // Minimal a11y smoke: key landmarks present
    await expect(page.getByRole('main')).toBeVisible();
    // Skip-link is in the DOM (sr-only by default, visible on focus)
    const skipLink = page.getByRole('link', { name: /skip to content/i });
    await expect(skipLink).toBeAttached();
  });
});
