/**
 * Micro-story — generation, reading, and tapping a word that didn't land.
 * Mocks the stories API to avoid needing a seeded database or a Gemini call.
 */
import { expect, test } from '@playwright/test';

const READY_STORY = {
  id: 'story-1',
  status: 'READY',
  stage: null,
  origin: 'ON_DEMAND',
  topic: 'football',
  source: {
    title: 'PSG schafft den Supercup-Doppelpack',
    url: 'https://www.kicker.de/psg-1242244/artikel',
    name: 'kicker',
    publishedAt: '2026-08-12T20:55:54.000Z',
  },
  cefrLevel: 'A2.1',
  title: 'Ein grüner Tag',
  text: 'Das Haus ist grün. Anna geht zum Haus.',
  translation: 'The house is green. Anna walks to the house.',
  audioUrl: '/api/static/audio/story-story-1.mp3',
  // A remote Unsplash URL would be a real network fetch from the browser under
  // test; the no-image path is the one worth exercising end to end anyway.
  image: null,
  error: null,
  completedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  targets: [
    {
      entryId: 'e1',
      word: 'Haus',
      surfaceForm: 'Haus',
      translation: 'house',
      emoji: '🏠',
      understood: null,
    },
    {
      entryId: 'e2',
      word: 'grün',
      surfaceForm: 'grün',
      translation: 'green',
      emoji: null,
      understood: null,
    },
  ],
};

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

test.describe('Micro-story', () => {
  test.beforeEach(async ({ page }) => {
    // The consent banner is fixed to the bottom and intercepts clicks on the
    // narrow viewport once the story is long enough to scroll.
    await page.addInitScript(() => localStorage.setItem('vocabahn_consent', 'denied'));
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill(
        json({
          id: 'e2e-user',
          email: 'e2e@vocabahn.test',
          name: 'E2E',
          avatarUrl: null,
          cefrLevel: 'A2.1',
          interests: [],
        }),
      ),
    );
    await page.route('**/api/v1/health', (route) =>
      route.fulfill(json({ status: 'ok', services: { database: 'up', redis: 'up' } })),
    );
    await page.route('**/api/v1/stories/quota**', (route) => route.fulfill(json({ used: 2, cap: 10 })));
    // Nothing waiting by default; the "today's read" test overrides this.
    await page.route('**/api/v1/stories/latest', (route) => route.fulfill(json({ story: null })));
  });

  test('offers a subject to read about and shows the remaining daily allowance', async ({ page }) => {
    await page.goto('/story');

    await expect(page.getByRole('button', { name: 'Find me something to read' })).toBeVisible({
      timeout: 4000,
    });
    await expect(page.getByText('8 of 10 left today')).toBeVisible();
    await expect(page.getByRole('button', { name: /Technology/ })).toBeVisible();
  });

  test('sends the chosen subject and credits the publisher it retold', async ({ page }) => {
    let sentTopic: string | undefined;
    await page.route('**/api/v1/stories', (route) => {
      sentTopic = (route.request().postDataJSON() as { topic?: string }).topic;
      return route.fulfill(json({ story: { ...READY_STORY, status: 'PENDING', text: null, targets: [] } }));
    });
    await page.route('**/api/v1/stories/story-1', (route) => route.fulfill(json({ story: READY_STORY })));

    await page.goto('/story');
    await page.getByRole('button', { name: /Football/ }).click();
    await page.getByRole('button', { name: 'Read about football' }).click();

    await expect(page.getByText('Ein grüner Tag')).toBeVisible({ timeout: 15000 });
    expect(sentTopic).toBe('football');

    // The learner can see who reported it and go read the original.
    await expect(page.getByText('Retold from kicker')).toBeVisible();
    await expect(
      page.getByRole('link', { name: /PSG schafft den Supercup-Doppelpack/ }),
    ).toHaveAttribute('href', 'https://www.kicker.de/psg-1242244/artikel');
  });

  test("picks up a story the scheduler wrote, with no id in this browser", async ({ page }) => {
    const daily = { ...READY_STORY, origin: 'DAILY' };
    await page.route('**/api/v1/stories/latest', (route) => route.fulfill(json({ story: daily })));
    await page.route('**/api/v1/stories/story-1', (route) => route.fulfill(json({ story: daily })));

    await page.goto('/story');

    await expect(page.getByText("Today's read")).toBeVisible({ timeout: 4000 });
    await expect(page.getByText('Ein grüner Tag')).toBeVisible();
  });

  test('polls a generating story until it is ready to read', async ({ page }) => {
    let polls = 0;
    await page.route('**/api/v1/stories', (route) =>
      route.fulfill(json({ story: { ...READY_STORY, status: 'PENDING', text: null, targets: [] } })),
    );
    await page.route('**/api/v1/stories/story-1', (route) => {
      polls += 1;
      // First poll still generating, then the finished story.
      const story = polls === 1 ? { ...READY_STORY, status: 'GENERATING', text: null, targets: [] } : READY_STORY;
      return route.fulfill(json({ story }));
    });

    await page.goto('/story');
    await page.getByRole('button', { name: 'Find me something to read' }).click();

    // Scoped to the status block — the sr-only announcer carries similar text.
    await expect(
      page.getByRole('status').getByText('Rewriting the article at your level…'),
    ).toBeVisible({ timeout: 4000 });
    await expect(page.getByText('Ein grüner Tag')).toBeVisible({ timeout: 15000 });
  });

  test("tapping a word marks it as didn't land and reveals its translation", async ({ page }) => {
    await page.route('**/api/v1/stories/story-1/complete', async (route) => {
      const body = route.request().postDataJSON() as { notUnderstood: string[] };
      expect(body.notUnderstood).toEqual(['e2']);
      return route.fulfill(
        json({
          story: {
            ...READY_STORY,
            completedAt: '2026-01-01T00:05:00.000Z',
            targets: [
              { ...READY_STORY.targets[0], understood: true },
              { ...READY_STORY.targets[1], understood: false },
            ],
          },
        }),
      );
    });
    await page.route('**/api/v1/stories/story-1', (route) => route.fulfill(json({ story: READY_STORY })));

    await page.addInitScript(() => localStorage.setItem('vocabahn-story-id', 'story-1'));
    await page.goto('/story');

    const word = page.getByRole('button', { name: 'grün', exact: true });
    await expect(word).toBeVisible({ timeout: 4000 });
    await expect(word).toHaveAttribute('aria-pressed', 'false');

    await word.click();

    await expect(word).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('— green')).toBeVisible();

    await page.getByRole('button', { name: 'Finish reading' }).click();

    await expect(page.getByText("1 of 2 words didn't land.")).toBeVisible({ timeout: 4000 });
  });
});
