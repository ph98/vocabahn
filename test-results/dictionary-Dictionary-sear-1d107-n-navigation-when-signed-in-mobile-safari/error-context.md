# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dictionary.spec.ts >> Dictionary search (authenticated) >> shows main navigation when signed in
- Location: e2e/dictionary.spec.ts:54:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('link', { name: 'Courses' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('link', { name: 'Courses' })

```

```yaml
- link "Skip to content":
  - /url: "#main"
- paragraph: Dashboard
- main:
  - navigation "Main":
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
  - region "Dashboard":
    - heading "Dashboard" [level=2]
    - paragraph: Loading dashboard…
  - link "v1.0.0":
    - /url: https://github.com/ph98/vocabahn/blob/main/docs/changelog.md
  - link "System status":
    - /url: /status
    - img "down"
```

# Test source

```ts
  1   | /**
  2   |  * Dictionary search flow (authenticated).
  3   |  * Uses a mock-authenticated session via localStorage to bypass Google OAuth.
  4   |  */
  5   | import { expect, test } from '@playwright/test';
  6   | 
  7   | // Helper: inject a fake auth session so the app renders the authenticated view.
  8   | // Vocabahn uses a JWT cookie; we seed the API mock via localStorage flag instead
  9   | // so the React app fetches /api/v1/auth/me and gets a canned response.
  10  | // In real CI these tests run against a seeded test database with a pre-created user.
  11  | const AUTH_STORAGE = {
  12  |   origins: [
  13  |     {
  14  |       origin: 'http://localhost:5173',
  15  |       localStorage: [{ name: '__e2e_bypass_auth', value: '1' }],
  16  |     },
  17  |   ],
  18  | };
  19  | 
  20  | test.describe('Dictionary search (authenticated)', () => {
  21  |   test.use({ storageState: { cookies: [], origins: AUTH_STORAGE.origins } });
  22  | 
  23  |   test.beforeEach(async ({ page }) => {
  24  |     // Route the me endpoint so the app thinks we are signed in.
  25  |     await page.route('**/api/v1/auth/me', (route) =>
  26  |       route.fulfill({
  27  |         status: 200,
  28  |         contentType: 'application/json',
  29  |         body: JSON.stringify({
  30  |           id: 'e2e-user',
  31  |           email: 'e2e@vocabahn.test',
  32  |           name: 'E2E User',
  33  |           avatarUrl: null,
  34  |           cefrLevel: null,
  35  |         }),
  36  |       }),
  37  |     );
  38  | 
  39  |     // Route health so the status dot shows green.
  40  |     await page.route('**/api/v1/health', (route) =>
  41  |       route.fulfill({
  42  |         status: 200,
  43  |         contentType: 'application/json',
  44  |         body: JSON.stringify({ status: 'ok', services: { database: 'up', redis: 'up' } }),
  45  |       }),
  46  |     );
  47  | 
  48  |     // Route courses so nav doesn't show errors.
  49  |     await page.route('**/api/v1/courses', (route) =>
  50  |       route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  51  |     );
  52  |   });
  53  | 
  54  |   test('shows main navigation when signed in', async ({ page }) => {
  55  |     await page.goto('/');
  56  |     await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  57  |     await expect(page.getByRole('link', { name: 'Dictionary' })).toBeVisible();
> 58  |     await expect(page.getByRole('link', { name: 'Courses' })).toBeVisible();
      |                                                               ^ Error: expect(locator).toBeVisible() failed
  59  |     await expect(page.getByRole('link', { name: 'Review' })).toBeVisible();
  60  |   });
  61  | 
  62  |   test('dictionary search input is present and focusable', async ({ page }) => {
  63  |     await page.goto('/');
  64  |     const searchInput = page.getByRole('textbox');
  65  |     await expect(searchInput.first()).toBeVisible();
  66  |     await searchInput.first().focus();
  67  |     await expect(searchInput.first()).toBeFocused();
  68  |   });
  69  | 
  70  |   test('typing a word shows search results', async ({ page }) => {
  71  |     await page.route('**/api/v1/dictionary/search**', (route) =>
  72  |       route.fulfill({
  73  |         status: 200,
  74  |         contentType: 'application/json',
  75  |         body: JSON.stringify([
  76  |           { id: '1', word: 'Haus', translation: 'house', cefrLevel: 'A1', emoji: '🏠' },
  77  |           { id: '2', word: 'hausgemacht', translation: 'homemade', cefrLevel: 'B1', emoji: null },
  78  |         ]),
  79  |       }),
  80  |     );
  81  | 
  82  |     await page.goto('/');
  83  |     const searchInput = page.getByRole('textbox').first();
  84  |     await searchInput.fill('Haus');
  85  | 
  86  |     // Results list should appear
  87  |     await expect(page.getByText('Haus')).toBeVisible({ timeout: 3000 });
  88  |   });
  89  | 
  90  |   test('navigating to a word page shows entry detail', async ({ page }) => {
  91  |     await page.route('**/api/v1/dictionary/Haus', (route) =>
  92  |       route.fulfill({
  93  |         status: 200,
  94  |         contentType: 'application/json',
  95  |         body: JSON.stringify({
  96  |           id: '1',
  97  |           word: 'Haus',
  98  |           translation: 'house',
  99  |           cefrLevel: 'A1',
  100 |           emoji: '🏠',
  101 |           examples: [],
  102 |           senses: [],
  103 |         }),
  104 |       }),
  105 |     );
  106 | 
  107 |     await page.goto('/word/Haus');
  108 |     await expect(page.getByText('Haus')).toBeVisible({ timeout: 3000 });
  109 |   });
  110 | 
  111 |   test('version number is visible in the footer', async ({ page }) => {
  112 |     await page.goto('/');
  113 |     // Footer should show v followed by a semver number.
  114 |     const footer = page.getByRole('contentinfo');
  115 |     await expect(footer).toBeVisible();
  116 |     await expect(footer.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
  117 |   });
  118 | });
  119 | 
```