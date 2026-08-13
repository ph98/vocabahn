/**
 * Dictionary search flow, signed in, with the API stubbed.
 *
 * Fast and hermetic on purpose: no database, no account, no network. Which
 * also means it proves nothing about a deployment — `e2e/monitor/` is where
 * the live dictionary is exercised.
 */
import { expect, test } from '@playwright/test';
import { json, mockEntryDetail, mockHealth, mockSearchResult, mockUser } from './support/fixtures';

test.describe('Dictionary search (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    // `fetchMe` resolving to a user is the whole of "signed in" as far as the
    // app is concerned; the real cookie never leaves the API.
    await page.route('**/api/v1/auth/me', (route) => route.fulfill(json(mockUser)));
    await page.route('**/api/v1/health', (route) => route.fulfill(json(mockHealth)));
    await page.route('**/api/v1/courses', (route) => route.fulfill(json({ courses: [] })));
  });

  test('shows main navigation when signed in', async ({ page }) => {
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Dictionary' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Library' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Start review session' })).toBeVisible();
  });

  test('dictionary search input is present and focusable', async ({ page }) => {
    await page.goto('/dictionary');

    const searchInput = page.getByLabel('Search German words');
    await expect(searchInput).toBeVisible();
    await searchInput.focus();
    await expect(searchInput).toBeFocused();
  });

  test('typing a word shows search results', async ({ page }) => {
    await page.route('**/api/v1/dictionary/search**', (route) =>
      route.fulfill(
        json({
          results: [
            mockSearchResult(),
            mockSearchResult({ word: 'hausgemacht', pos: 'adj', gender: null, translation: 'homemade' }),
          ],
        }),
      ),
    );

    await page.goto('/dictionary');
    await page.getByLabel('Search German words').fill('Haus');

    const results = page.getByRole('region', { name: 'Dictionary' }).getByRole('listitem');
    await expect(results).toHaveCount(2);
    await expect(results.first()).toContainText('Haus');
  });

  test('navigating to a word page shows entry detail', async ({ page }) => {
    await page.route('**/api/v1/dictionary/Haus?*', (route) =>
      route.fulfill(json(mockEntryDetail())),
    );

    await page.goto('/word/Haus');
    // The headword carries its article: "das Haus".
    await expect(page.getByRole('heading', { name: /Haus/ })).toBeVisible({ timeout: 5000 });
  });

  test('theme can be changed from the profile menu', async ({ page }) => {
    await page.goto('/');

    // The toggle lives behind the profile menu and cycles system → light → dark.
    await page.getByRole('button', { name: 'Profile navigation options' }).click();
    const themeButton = page.getByRole('button', { name: /theme$/ });
    const labelBefore = await themeButton.textContent();

    await themeButton.click();

    await page.getByRole('button', { name: 'Profile navigation options' }).click();
    await expect(page.getByRole('button', { name: /theme$/ })).not.toHaveText(labelBefore ?? '');
  });

  test('version number is visible in the footer', async ({ page }) => {
    await page.goto('/');

    // Located by element, not by the `contentinfo` role: the footer sits inside
    // <main>, and a scoped <footer> gets no landmark role.
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
  });
});
