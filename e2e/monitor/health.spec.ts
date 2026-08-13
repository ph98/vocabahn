/**
 * The cheapest live assertions: the API answers, its dependencies are up, and
 * the static site is being served. Nothing here is mocked.
 *
 * `scripts/health-check.sh` covers the same endpoint at a much higher frequency;
 * this spec exists so the full monitoring run also fails on a dependency
 * outage, and so its failure lands in the same report as everything else.
 *
 * Both checks go through `request` rather than a browser page on purpose:
 * loading the SPA signed out costs three of the auth controller's ten requests
 * per minute (`/auth/me`, the silent `/auth/refresh`, `/auth/config`), and that
 * budget belongs to `session.spec.ts`, which proves the bundle boots anyway.
 */
import { expect, test } from '@playwright/test';

test.describe('Deployed API health', { tag: '@monitor' }, () => {
  test('reports database and redis up', async ({ request }) => {
    const response = await request.get('/api/v1/health');

    expect(response.status(), 'GET /api/v1/health should answer 200').toBe(200);

    const body = (await response.json()) as {
      status: string;
      services: { database: string; redis: string };
    };

    expect(body.services.database, 'Postgres reachable from the API').toBe('up');
    expect(body.services.redis, 'Redis reachable from the API').toBe('up');
    expect(body.status).toBe('ok');
  });

  test('serves the single-page app shell', async ({ request }) => {
    const response = await request.get('/');

    expect(response.status(), 'GET / should answer 200').toBe(200);
    const html = await response.text();
    expect(html, 'the served document should be the app shell').toContain('<div id="root">');
  });
});
