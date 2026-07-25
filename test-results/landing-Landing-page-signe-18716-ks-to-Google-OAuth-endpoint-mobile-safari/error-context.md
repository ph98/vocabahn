# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: landing.spec.ts >> Landing page (signed out) >> sign-in button links to Google OAuth endpoint
- Location: e2e/landing.spec.ts:16:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.evaluate: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /sign in with google/i })

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - link "Skip to content" [ref=e3]:
    - /url: "#main"
  - paragraph [ref=e4]: Dashboard
  - generic: ‹
  - main [active] [ref=e5]:
    - generic [ref=e7]:
      - generic [ref=e9]:
        - img "Vocabahn" [ref=e11]
        - heading "Learn German, word by word." [level=1] [ref=e12]
        - paragraph [ref=e13]: Vocabahn is a free, open-source German vocabulary app with an AI-enriched dictionary and FSRS spaced-repetition flashcards.
        - generic [ref=e14]:
          - generic [ref=e16]:
            - img [ref=e17]:
              - generic [ref=e27]: A
            - heading "AI-enriched dictionary" [level=2] [ref=e28]
            - paragraph [ref=e29]: Every German word comes with examples, images, audio, memory hooks, and level tags — all generated automatically.
          - generic [ref=e31]:
            - img [ref=e32]:
              - generic [ref=e37]: ⭐
              - generic [ref=e38]: ⭐
              - generic [ref=e39]: ⭐
            - heading "Spaced-repetition flashcards" [level=2] [ref=e40]
            - paragraph [ref=e41]: FSRS-powered scheduling surfaces cards at exactly the right moment so you review less and remember more.
          - generic [ref=e43]:
            - heading "Progress you can see" [level=2] [ref=e54]
            - paragraph [ref=e55]: Streaks, a GitHub-style heatmap, and per-course stats keep you motivated on the journey from A1 to C1.
          - generic [ref=e57]:
            - img [ref=e58]:
              - generic [ref=e64]: ★
            - heading "Feels native on mobile" [level=2] [ref=e65]
            - paragraph [ref=e66]: Install as a PWA. Swipe cards to rate, pull to refresh, study offline — it works like a native app, not a website.
        - img "Accelerate your language journey" [ref=e68]
      - generic [ref=e70]:
        - generic [ref=e71]:
          - img "Vocabahn Logo" [ref=e73]
          - heading "Join Vocabahn" [level=2] [ref=e74]
          - paragraph [ref=e75]: Start your German learning journey today
        - generic [ref=e76]:
          - generic [ref=e77]:
            - heading "Welcome back" [level=3] [ref=e78]
            - paragraph [ref=e79]: Sign in to sync your progress
          - link "Sign in with Google" [ref=e80]:
            - /url: /api/v1/auth/google
          - generic [ref=e86]:
            - separator [ref=e87]
            - generic [ref=e88]: or
            - separator [ref=e89]
          - generic [ref=e90]:
            - generic [ref=e91]:
              - text: Email address
              - textbox "Email address" [ref=e92]:
                - /placeholder: you@example.com
            - button "Continue with Email" [disabled] [ref=e93]
        - paragraph [ref=e94]: By signing in, you agree to our Terms of Service and Privacy Policy.
    - generic [ref=e95]:
      - link "v1.0.0" [ref=e96]:
        - /url: https://github.com/ph98/vocabahn/blob/main/docs/changelog.md
      - link "System status" [ref=e97]:
        - /url: /status
        - img "up" [ref=e98]
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
> 21 |     const href = await signIn.evaluate((el) => {
     |                               ^ Error: locator.evaluate: Test timeout of 30000ms exceeded.
  22 |       const a = el.closest('a') ?? el.querySelector('a');
  23 |       return a ? a.getAttribute('href') : null;
  24 |     });
  25 |     expect(href).toMatch(/\/api\/v1\/auth\/google/);
  26 |   });
  27 | 
  28 |   test('theme toggle is visible and cycles theme', async ({ page }) => {
  29 |     await page.goto('/');
  30 |     const toggle = page.getByRole('button', { name: /active\. switch to/i });
  31 |     await expect(toggle).toBeVisible();
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