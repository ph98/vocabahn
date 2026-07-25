# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: landing.spec.ts >> Landing page (signed out) >> theme toggle is visible and cycles theme
- Location: e2e/landing.spec.ts:28:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /active\. switch to/i })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('button', { name: /active\. switch to/i })

```

```yaml
- link "Skip to content":
  - /url: "#main"
- paragraph: Dashboard
- main:
  - img "Vocabahn"
  - heading "Learn German, word by word." [level=1]
  - paragraph: Vocabahn is a free, open-source German vocabulary app with an AI-enriched dictionary and FSRS spaced-repetition flashcards.
  - heading "AI-enriched dictionary" [level=2]
  - paragraph: Every German word comes with examples, images, audio, memory hooks, and level tags — all generated automatically.
  - heading "Spaced-repetition flashcards" [level=2]
  - paragraph: FSRS-powered scheduling surfaces cards at exactly the right moment so you review less and remember more.
  - heading "Progress you can see" [level=2]
  - paragraph: Streaks, a GitHub-style heatmap, and per-course stats keep you motivated on the journey from A1 to C1.
  - heading "Feels native on mobile" [level=2]
  - paragraph: Install as a PWA. Swipe cards to rate, pull to refresh, study offline — it works like a native app, not a website.
  - img "Accelerate your language journey"
  - img "Vocabahn Logo"
  - heading "Join Vocabahn" [level=2]
  - paragraph: Start your German learning journey today
  - heading "Welcome back" [level=3]
  - paragraph: Sign in to sync your progress
  - link "Sign in with Google":
    - /url: /api/v1/auth/google
  - separator
  - text: or
  - separator
  - text: Email address
  - textbox "Email address":
    - /placeholder: you@example.com
  - button "Continue with Email" [disabled]
  - paragraph: By signing in, you agree to our Terms of Service and Privacy Policy.
  - link "v1.0.0":
    - /url: https://github.com/ph98/vocabahn/blob/main/docs/changelog.md
  - link "System status":
    - /url: /status
    - img "up"
```

# Test source

```ts
  1  | /**
  2  |  * Landing / auth flow.
  3  |  * Tests the unauthenticated state: landing page content and sign-in button.
  4  |  */
  5  | import { expect, test } from '@playwright/test';
  6  | 
  7  | test.describe('Landing page (signed out)', () => {
  8  |   test('shows app name, tagline, and sign-in button', async ({ page }) => {
  9  |     await page.goto('/');
  10 | 
  11 |     await expect(page.getByRole('heading', { name: /vocabahn/i })).toBeVisible();
  12 |     await expect(page.getByText(/german vocabulary/i)).toBeVisible();
  13 |     await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible();
  14 |   });
  15 | 
  16 |   test('sign-in button links to Google OAuth endpoint', async ({ page }) => {
  17 |     await page.goto('/');
  18 |     const signIn = page.getByRole('button', { name: /sign in with google/i });
  19 |     // Clicking redirects to /api/v1/auth/google — we just verify the href on the
  20 |     // underlying anchor (the link form of the button) rather than following the redirect.
  21 |     const href = await signIn.evaluate((el) => {
  22 |       const a = el.closest('a') ?? el.querySelector('a');
  23 |       return a ? a.getAttribute('href') : null;
  24 |     });
  25 |     expect(href).toMatch(/\/api\/v1\/auth\/google/);
  26 |   });
  27 | 
  28 |   test('theme toggle is visible and cycles theme', async ({ page }) => {
  29 |     await page.goto('/');
  30 |     const toggle = page.getByRole('button', { name: /active\. switch to/i });
> 31 |     await expect(toggle).toBeVisible();
     |                          ^ Error: expect(locator).toBeVisible() failed
  32 |     const labelBefore = await toggle.getAttribute('aria-label');
  33 |     await toggle.click();
  34 |     const labelAfter = await toggle.getAttribute('aria-label');
  35 |     expect(labelAfter).not.toBe(labelBefore);
  36 |   });
  37 | 
  38 |   test('has no obvious accessibility violations on load', async ({ page }) => {
  39 |     await page.goto('/');
  40 |     // Minimal a11y smoke: key landmarks present
  41 |     await expect(page.getByRole('main')).toBeVisible();
  42 |     // Skip-link is in the DOM (sr-only by default, visible on focus)
  43 |     const skipLink = page.getByRole('link', { name: /skip to content/i });
  44 |     await expect(skipLink).toBeAttached();
  45 |   });
  46 | });
  47 | 
```