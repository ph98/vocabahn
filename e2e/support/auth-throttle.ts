/**
 * Pacing the live suite around the auth controller's rate limit.
 *
 * `AuthController` carries `@Throttle({ default: { limit: 10, ttl: 60_000 } })`
 * — ten requests per minute per IP — and the endpoints it covers are exactly
 * the ones this suite exercises. The budget goes faster than it looks: one
 * signed-out page load already costs three (`/auth/me`, the silent
 * `/auth/refresh` behind it, and `/auth/config`), so a full sign-in spends
 * close to the whole window on its own.
 *
 * Measured on a live stack, the unpaced suite issued 21 auth requests in about
 * three seconds. Past the tenth, `fetchMe` sees a 429, returns null by design
 * (`apps/web/src/api.ts`), and the app renders signed out — which looks
 * identical to a broken session and would page somebody every half hour for a
 * limit the suite tripped itself.
 *
 * So the phases are spaced deliberately. Two minutes of waiting inside a run
 * that happens every thirty is a good trade for an alert that means something.
 */

/** `ttl` on the auth controller's throttler, plus a second of headroom. */
const AUTH_THROTTLE_WINDOW_MS = 61_000;

/**
 * Waits out one full throttle window. Call between phases that each spend a
 * meaningful share of the ten-request budget.
 */
export async function letAuthThrottleWindowLapse(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, AUTH_THROTTLE_WINDOW_MS));
}
