/**
 * Review session — keyboard flow and accessibility, with the due-cards API
 * stubbed so no seeded database is needed. The live equivalent, which actually
 * rates a card against a deployment, lives in `e2e/monitor/session.spec.ts`.
 */
import { expect, test } from '@playwright/test';
import { json, mockDueCard, mockEntryDetail, mockHealth, mockUser } from './support/fixtures';

const dueCard = mockDueCard();

test.describe('Review session', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/auth/me', (route) => route.fulfill(json(mockUser)));
    await page.route('**/api/v1/health', (route) => route.fulfill(json(mockHealth)));
  });

  test('shows "all caught up" when no cards are due', async ({ page }) => {
    await page.route('**/api/v1/reviews/due**', (route) => route.fulfill(json({ cards: [] })));

    await page.goto('/review');
    await expect(page.getByRole('heading', { name: /all caught up/i })).toBeVisible({ timeout: 4000 });
  });

  test('shows a card and reveal button when a card is due', async ({ page }) => {
    await page.route('**/api/v1/reviews/due**', (route) => route.fulfill(json({ cards: [dueCard] })));

    await page.goto('/review');
    const flashcard = page.getByRole('group', { name: 'Flashcard' });
    await expect(flashcard).toBeVisible({ timeout: 4000 });
    await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible();
    await expect(flashcard.getByText('lernen', { exact: true })).toBeVisible();
  });

  test('pressing Space reveals the card answer', async ({ page }) => {
    await page.route('**/api/v1/reviews/due**', (route) => route.fulfill(json({ cards: [dueCard] })));
    await page.route('**/api/v1/dictionary/lernen?*', (route) =>
      route.fulfill(json(mockEntryDetail({ id: 'entry-1', word: 'lernen', pos: 'verb', translation: 'to learn' }))),
    );

    await page.goto('/review');
    await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible({ timeout: 4000 });
    await page.keyboard.press('Space');

    await expect(page.getByRole('button', { name: 'Again', exact: true })).toBeVisible({ timeout: 2000 });
  });

  test('keyboard shortcuts are hinted before and after the reveal', async ({ page }) => {
    await page.route('**/api/v1/reviews/due**', (route) => route.fulfill(json({ cards: [dueCard] })));

    await page.goto('/review');
    await expect(page.getByText(/press space or enter to reveal/i)).toBeVisible({ timeout: 4000 });

    await page.getByRole('button', { name: 'Show answer' }).click();
    await expect(page.getByText(/arrow keys/i)).toBeVisible({ timeout: 4000 });
  });
});
