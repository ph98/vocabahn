/**
 * Dictionary search flow (authenticated).
 * Uses a mock-authenticated session via localStorage to bypass Google OAuth.
 */
import { expect, test } from '@playwright/test';

// Helper: inject a fake auth session so the app renders the authenticated view.
// Vocabahn uses a JWT cookie; we seed the API mock via localStorage flag instead
// so the React app fetches /api/v1/auth/me and gets a canned response.
// In real CI these tests run against a seeded test database with a pre-created user.
const AUTH_STORAGE = {
  origins: [
    {
      origin: 'http://localhost:5173',
      localStorage: [{ name: '__e2e_bypass_auth', value: '1' }],
    },
  ],
};

test.describe('Dictionary search (authenticated)', () => {
  test.use({ storageState: { cookies: [], origins: AUTH_STORAGE.origins } });

  test.beforeEach(async ({ page }) => {
    // Route the me endpoint so the app thinks we are signed in.
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'e2e-user',
          email: 'e2e@vocabahn.test',
          name: 'E2E User',
          avatarUrl: null,
          cefrLevel: null,
        }),
      }),
    );

    // Route health so the status dot shows green.
    await page.route('**/api/v1/health', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', services: { database: 'up', redis: 'up' } }),
      }),
    );

    // Route courses so nav doesn't show errors.
    await page.route('**/api/v1/courses', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
  });

  test('shows main navigation when signed in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dictionary' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Courses' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Review' })).toBeVisible();
  });

  test('dictionary search input is present and focusable', async ({ page }) => {
    await page.goto('/');
    const searchInput = page.getByRole('textbox');
    await expect(searchInput.first()).toBeVisible();
    await searchInput.first().focus();
    await expect(searchInput.first()).toBeFocused();
  });

  test('typing a word shows search results', async ({ page }) => {
    await page.route('**/api/v1/dictionary/search**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: '1', word: 'Haus', translation: 'house', cefrLevel: 'A1', emoji: '🏠' },
          { id: '2', word: 'hausgemacht', translation: 'homemade', cefrLevel: 'B1', emoji: null },
        ]),
      }),
    );

    await page.goto('/');
    const searchInput = page.getByRole('textbox').first();
    await searchInput.fill('Haus');

    // Results list should appear
    await expect(page.getByText('Haus')).toBeVisible({ timeout: 3000 });
  });

  test('navigating to a word page shows entry detail', async ({ page }) => {
    await page.route('**/api/v1/dictionary/Haus', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '1',
          word: 'Haus',
          translation: 'house',
          cefrLevel: 'A1',
          emoji: '🏠',
          examples: [],
          senses: [],
        }),
      }),
    );

    await page.goto('/word/Haus');
    await expect(page.getByText('Haus')).toBeVisible({ timeout: 3000 });
  });

  test('version number is visible in the footer', async ({ page }) => {
    await page.goto('/');
    // Footer should show v followed by a semver number.
    const footer = page.getByRole('contentinfo');
    await expect(footer).toBeVisible();
    await expect(footer.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
  });
});
