# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: review.spec.ts >> Review session >> shows a card and reveal button when a card is due
- Location: e2e/review.spec.ts:45:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('group', { name: 'Flashcard' })
Expected: visible
Timeout: 4000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 4000ms
  - waiting for getByRole('group', { name: 'Flashcard' })

```

```yaml
- link "Skip to content":
  - /url: "#main"
- paragraph: Review
- main:
  - navigation "Main":
    - link "Vocabahn Home":
      - /url: /
      - img "Vocabahn"
    - link "Dashboard":
      - /url: /
    - link "Dictionary":
      - /url: /dictionary
    - link "Start review session":
      - /url: /review
      - text: Review
    - link "Library":
      - /url: /library
    - button "Profile navigation options": Profile
  - region "Review session":
    - heading "Review" [level=2]
    - paragraph
    - paragraph: Loading due cards…
  - link "v1.0.0":
    - /url: https://github.com/ph98/vocabahn/blob/main/docs/changelog.md
  - link "System status":
    - /url: /status
    - img "down"
```

# Test source

```ts
  1  | /**
  2  |  * Review session — keyboard flow and accessibility.
  3  |  * Mocks the due-cards API to avoid needing a seeded database.
  4  |  */
  5  | import { expect, test } from '@playwright/test';
  6  | 
  7  | const mockCard = {
  8  |   id: 'card-1',
  9  |   entry: {
  10 |     id: 'entry-1',
  11 |     word: 'lernen',
  12 |     translation: 'to learn',
  13 |     cefrLevel: 'A1',
  14 |     emoji: '📚',
  15 |     audioUrl: null,
  16 |     imageUrl: null,
  17 |     examples: [],
  18 |   },
  19 |   fsrsState: 'New',
  20 | };
  21 | 
  22 | test.describe('Review session', () => {
  23 |   test.beforeEach(async ({ page }) => {
  24 |     await page.route('**/api/v1/auth/me', (route) =>
  25 |       route.fulfill({
  26 |         status: 200,
  27 |         contentType: 'application/json',
  28 |         body: JSON.stringify({ id: 'e2e-user', email: 'e2e@vocabahn.test', name: 'E2E', avatarUrl: null, cefrLevel: null }),
  29 |       }),
  30 |     );
  31 |     await page.route('**/api/v1/health', (route) =>
  32 |       route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', services: { database: 'up', redis: 'up' } }) }),
  33 |     );
  34 |   });
  35 | 
  36 |   test('shows "all caught up" when no cards are due', async ({ page }) => {
  37 |     await page.route('**/api/v1/reviews/due**', (route) =>
  38 |       route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  39 |     );
  40 | 
  41 |     await page.goto('/review');
  42 |     await expect(page.getByText(/all caught up/i)).toBeVisible({ timeout: 4000 });
  43 |   });
  44 | 
  45 |   test('shows a card and reveal button when a card is due', async ({ page }) => {
  46 |     await page.route('**/api/v1/reviews/due**', (route) =>
  47 |       route.fulfill({
  48 |         status: 200,
  49 |         contentType: 'application/json',
  50 |         body: JSON.stringify([mockCard]),
  51 |       }),
  52 |     );
  53 | 
  54 |     await page.goto('/review');
> 55 |     await expect(page.getByRole('group', { name: 'Flashcard' })).toBeVisible({ timeout: 4000 });
     |                                                                  ^ Error: expect(locator).toBeVisible() failed
  56 |     await expect(page.getByRole('button', { name: /show answer/i })).toBeVisible();
  57 |     // German word on the card
  58 |     await expect(page.getByText('lernen')).toBeVisible();
  59 |   });
  60 | 
  61 |   test('pressing Space reveals the card answer', async ({ page }) => {
  62 |     await page.route('**/api/v1/reviews/due**', (route) =>
  63 |       route.fulfill({
  64 |         status: 200,
  65 |         contentType: 'application/json',
  66 |         body: JSON.stringify([mockCard]),
  67 |       }),
  68 |     );
  69 |     await page.route('**/api/v1/dictionary/lernen', (route) =>
  70 |       route.fulfill({
  71 |         status: 200,
  72 |         contentType: 'application/json',
  73 |         body: JSON.stringify({ ...mockCard.entry, senses: [{ gloss: 'to learn' }], examples: [] }),
  74 |       }),
  75 |     );
  76 | 
  77 |     await page.goto('/review');
  78 |     await expect(page.getByRole('button', { name: /show answer/i })).toBeVisible({ timeout: 4000 });
  79 |     await page.keyboard.press('Space');
  80 |     // Rating buttons appear after reveal
  81 |     await expect(page.getByRole('button', { name: /again/i })).toBeVisible({ timeout: 2000 });
  82 |   });
  83 | 
  84 |   test('keyboard shortcuts hint is visible', async ({ page }) => {
  85 |     await page.route('**/api/v1/reviews/due**', (route) =>
  86 |       route.fulfill({
  87 |         status: 200,
  88 |         contentType: 'application/json',
  89 |         body: JSON.stringify([mockCard]),
  90 |       }),
  91 |     );
  92 | 
  93 |     await page.goto('/review');
  94 |     await expect(page.getByText(/arrow keys/i)).toBeVisible({ timeout: 4000 });
  95 |   });
  96 | });
  97 | 
```