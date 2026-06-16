/**
 * Review session — keyboard flow and accessibility.
 * Mocks the due-cards API to avoid needing a seeded database.
 */
import { expect, test } from '@playwright/test';

const mockCard = {
  id: 'card-1',
  entry: {
    id: 'entry-1',
    word: 'lernen',
    translation: 'to learn',
    cefrLevel: 'A1',
    emoji: '📚',
    audioUrl: null,
    imageUrl: null,
    examples: [],
  },
  fsrsState: 'New',
};

test.describe('Review session', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'e2e-user', email: 'e2e@vocabahn.test', name: 'E2E', avatarUrl: null, cefrLevel: null }),
      }),
    );
    await page.route('**/api/v1/health', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', services: { database: 'up', redis: 'up' } }) }),
    );
  });

  test('shows "all caught up" when no cards are due', async ({ page }) => {
    await page.route('**/api/v1/reviews/due**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );

    await page.goto('/review');
    await expect(page.getByText(/all caught up/i)).toBeVisible({ timeout: 4000 });
  });

  test('shows a card and reveal button when a card is due', async ({ page }) => {
    await page.route('**/api/v1/reviews/due**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockCard]),
      }),
    );

    await page.goto('/review');
    await expect(page.getByRole('group', { name: 'Flashcard' })).toBeVisible({ timeout: 4000 });
    await expect(page.getByRole('button', { name: /show answer/i })).toBeVisible();
    // German word on the card
    await expect(page.getByText('lernen')).toBeVisible();
  });

  test('pressing Space reveals the card answer', async ({ page }) => {
    await page.route('**/api/v1/reviews/due**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockCard]),
      }),
    );
    await page.route('**/api/v1/dictionary/lernen', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockCard.entry, senses: [{ gloss: 'to learn' }], examples: [] }),
      }),
    );

    await page.goto('/review');
    await expect(page.getByRole('button', { name: /show answer/i })).toBeVisible({ timeout: 4000 });
    await page.keyboard.press('Space');
    // Rating buttons appear after reveal
    await expect(page.getByRole('button', { name: /again/i })).toBeVisible({ timeout: 2000 });
  });

  test('keyboard shortcuts hint is visible', async ({ page }) => {
    await page.route('**/api/v1/reviews/due**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockCard]),
      }),
    );

    await page.goto('/review');
    await expect(page.getByText(/arrow keys/i)).toBeVisible({ timeout: 4000 });
  });
});
