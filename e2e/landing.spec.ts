/**
 * Landing / auth flow.
 * Tests the unauthenticated state: landing page content and sign-in button.
 */
import { expect, test } from '@playwright/test';

test.describe('Landing page (signed out)', () => {
  test('shows app name, tagline, and sign-in button', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /vocabahn/i })).toBeVisible();
    await expect(page.getByText(/german vocabulary/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible();
  });

  test('sign-in button links to Google OAuth endpoint', async ({ page }) => {
    await page.goto('/');
    const signIn = page.getByRole('button', { name: /sign in with google/i });
    // Clicking redirects to /api/v1/auth/google — we just verify the href on the
    // underlying anchor (the link form of the button) rather than following the redirect.
    const href = await signIn.evaluate((el) => {
      const a = el.closest('a') ?? el.querySelector('a');
      return a ? a.getAttribute('href') : null;
    });
    expect(href).toMatch(/\/api\/v1\/auth\/google/);
  });

  test('theme toggle is visible and cycles theme', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: /active\. switch to/i });
    await expect(toggle).toBeVisible();
    const labelBefore = await toggle.getAttribute('aria-label');
    await toggle.click();
    const labelAfter = await toggle.getAttribute('aria-label');
    expect(labelAfter).not.toBe(labelBefore);
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
