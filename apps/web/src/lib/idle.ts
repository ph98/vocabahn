/**
 * "Do this, but not while the page is still trying to paint."
 *
 * Anything a first-time visitor does not need in order to read the landing page
 * — a third-party SDK, an analytics widget — belongs behind this rather than in
 * a bare `useEffect`, which runs inside the very frames LCP is measured over.
 *
 * `requestIdleCallback` is missing on Safari < 17, so the fallback is a plain
 * timer at the same deadline: late is the point, and a deterministic delay is
 * better than firing immediately on a quarter of iOS.
 */

/** Deadline for the idle callback, and the fallback delay where it is missing. */
export const IDLE_TIMEOUT_MS = 2_000;

/** Cancels a scheduled callback, whichever mechanism scheduled it. */
export type CancelIdle = () => void;

/**
 * Runs `fn` once the browser is idle, or at `timeoutMs` at the latest.
 * Returns a canceller safe to use as an effect cleanup.
 */
export function onIdle(fn: () => void, timeoutMs: number = IDLE_TIMEOUT_MS): CancelIdle {
  if (typeof window === 'undefined') return () => {};

  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(fn, { timeout: timeoutMs });
    return () => window.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(fn, timeoutMs);
  return () => window.clearTimeout(handle);
}
