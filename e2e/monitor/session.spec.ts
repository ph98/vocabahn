/**
 * The live user journey, with nothing mocked.
 *
 * The rest of `e2e/` stubs `/api/v1/auth/me` so the PR check can run without a
 * backend. That trade is right for a PR and wrong for monitoring: those specs
 * pass against a production whose API is entirely down. Everything below talks
 * to the real deployment, signs in with a real magic link delivered to a real
 * mailbox, and asserts in the order things matter — session first, because a
 * broken refresh silently signs out every learner, and only then the loop.
 *
 * Serial by necessity: each test builds on the session the previous one
 * established, and there is one monitoring account per environment.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { excludeFromAnalytics } from '../support/analytics';
import { letAuthThrottleWindowLapse } from '../support/auth-throttle';
import { purgeMagicLinks, waitForMagicLinkToken } from '../support/mailbox';
import { requireMonitorConfig, type MonitorConfig } from '../support/monitor-config';

interface DueCard {
  id: string;
}

test.describe('Live session and core loop', { tag: '@monitor' }, () => {
  test.describe.configure({ mode: 'serial' });

  let config: MonitorConfig;
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // Throws, listing every missing variable, rather than letting the run go
    // green against an empty base URL.
    config = requireMonitorConfig();
    context = await browser.newContext();
    await excludeFromAnalytics(context);
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('signs in end to end through a real magic link', async () => {
    // Mail delivery dominates: the API request itself takes milliseconds.
    test.setTimeout(240_000);

    // Anything left over from an earlier run is already spent — clear it out so
    // the first poll cannot hand back a dead token.
    await purgeMagicLinks(config.imap, config.email);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /vocabahn/i }).first()).toBeVisible();

    const requestedAt = new Date();
    await page.getByPlaceholder('name@example.com').fill(config.email);
    await page.getByRole('button', { name: 'Send Magic Link' }).click();

    // The form only flips to this state once POST /auth/email/request resolves,
    // so a down or erroring API fails here rather than in the mailbox wait.
    await expect(page.getByText(/we sent a sign-in link/i)).toBeVisible({ timeout: 30_000 });

    const token = await waitForMagicLinkToken(config.imap, config.email, { requestedAt });

    await page.goto(`/auth/verify?token=${encodeURIComponent(token)}`);

    // /auth/verify hands the token to the API, which sets the cookie pair and
    // redirects to FRONTEND_URL. Landing anywhere else means the deployment's
    // FRONTEND_URL disagrees with the host learners actually use.
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).host, 'magic link redirected off the environment under test').toBe(
      new URL(config.baseUrl).host,
    );
  });

  test('/auth/me identifies the account and the session survives a reload', async () => {
    test.setTimeout(150_000);
    // Signing in spent most of the ten-per-minute auth budget; see
    // `support/auth-throttle.ts` for why continuing straight away would page
    // somebody for a limit this suite tripped itself.
    await letAuthThrottleWindowLapse();

    const me = await page.request.get('/api/v1/auth/me');
    expect(me.status(), 'GET /auth/me with the freshly issued cookie').toBe(200);
    expect(((await me.json()) as { email: string }).email.toLowerCase()).toBe(
      config.email.toLowerCase(),
    );

    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });

  test('refresh rotates the token pair', async () => {
    const cookieValue = async (name: string): Promise<string | undefined> =>
      (await context.cookies()).find((cookie) => cookie.name === name)?.value;

    const accessBefore = await cookieValue('vb_access');
    const refreshBefore = await cookieValue('vb_refresh');
    expect(accessBefore, 'vb_access should be set after sign-in').toBeTruthy();
    expect(refreshBefore, 'vb_refresh should be set after sign-in').toBeTruthy();

    // A JWT's `iat`/`exp` are whole seconds, so a token re-issued inside the
    // same second as the last one is byte-identical and says nothing either
    // way. Wait past the boundary so a changed value means real rotation.
    await new Promise((resolve) => setTimeout(resolve, 1_100));

    const refreshed = await page.request.post('/api/v1/auth/refresh');
    expect(refreshed.status(), 'POST /auth/refresh').toBe(200);

    const setCookies = refreshed
      .headersArray()
      .filter((header) => header.name.toLowerCase() === 'set-cookie')
      .map((header) => header.value)
      .join('\n');
    expect(setCookies, 'refresh should re-issue the access cookie').toContain('vb_access=');
    expect(setCookies, 'refresh should re-issue the refresh cookie').toContain('vb_refresh=');

    expect(await cookieValue('vb_access'), 'access token should be rotated').not.toBe(accessBefore);
    expect(await cookieValue('vb_refresh'), 'refresh token should be rotated').not.toBe(
      refreshBefore,
    );

    expect(
      (await page.request.get('/api/v1/auth/me')).status(),
      'the rotated access token should still authorise',
    ).toBe(200);
  });

  test('an expired access token is recovered silently instead of signing the user out', async () => {
    test.setTimeout(150_000);
    await letAuthThrottleWindowLapse();

    // The regression this suite exists to catch (#76): vb_access lives 15
    // minutes, so every learner hits this path several times a session. If the
    // silent refresh in fetchMe() breaks, they are all logged out and nothing
    // else in the app looks wrong.
    await context.clearCookies({ name: 'vb_access' });
    expect((await context.cookies()).find((cookie) => cookie.name === 'vb_access')).toBeUndefined();

    await page.reload();

    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({ timeout: 30_000 });
    expect(
      (await context.cookies()).find((cookie) => cookie.name === 'vb_access'),
      'the client should have re-obtained an access cookie without user action',
    ).toBeDefined();
  });

  test('dictionary search returns results from the live index', async () => {
    await page.goto('/dictionary');

    const dictionary = page.getByRole('region', { name: 'Dictionary' });
    await dictionary.getByLabel('Search German words').fill('Haus');

    // Deliberately no click through to /word/<x>: viewing an unenriched entry
    // enqueues a paid enrichment job against this account's daily cap
    // (docs/system/enrichment.md), and monitoring must not spend quota.
    await expect(dictionary.getByRole('listitem').first()).toBeVisible({ timeout: 20_000 });
  });

  test('a due card loads and a rating reaches the API', async () => {
    test.setTimeout(120_000);

    const due = await ensureDueCards();
    expect(due.length, 'the monitoring account should have a card to review').toBeGreaterThan(0);

    await page.goto('/review');
    await expect(page.getByRole('group', { name: 'Flashcard' })).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Show answer' }).click();

    // Assert on the response, not the UI: ReviewSession deliberately falls back
    // to the offline queue when the POST fails, so a card that "looks rated"
    // proves nothing about the API.
    const submitted = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && /\/api\/v1\/reviews\/[^/]+$/.test(response.url()),
      { timeout: 30_000 },
    );
    await page.getByRole('button', { name: 'Good', exact: true }).click();

    expect((await submitted).status(), 'POST /api/v1/reviews/<cardId>').toBeLessThan(300);
  });

  /**
   * The monitoring account's cards are disposable. If it has nothing due —
   * a fresh account, or everything scheduled into the future — enrol it in the
   * configured course, which creates one new card per course word.
   */
  async function ensureDueCards(): Promise<DueCard[]> {
    const read = async (): Promise<DueCard[]> => {
      const response = await page.request.get('/api/v1/reviews/due?limit=1');
      expect(response.status(), 'GET /api/v1/reviews/due').toBe(200);
      return ((await response.json()) as { cards: DueCard[] }).cards;
    };

    const first = await read();
    if (first.length > 0 || !config.seedCourseSlug) return first;

    const enrolled = await page.request.post(
      `/api/v1/courses/${encodeURIComponent(config.seedCourseSlug)}/enroll`,
    );
    expect(enrolled.ok(), `enrolling the monitoring account in ${config.seedCourseSlug}`).toBe(true);

    return read();
  }
});
