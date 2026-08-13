/**
 * Picking up a redeploy in a tab that is already running the previous build.
 *
 * The PWA registers with `registerType: 'autoUpdate'`, so the fix for a chunk
 * that no longer exists is to let the service worker fetch the new revision
 * (`skipWaiting` / `clientsClaim` are on, so it takes over immediately) and
 * then reload. A plain reload alone can be served the stale precached
 * `index.html` again.
 */
export async function reloadToLatestVersion(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.update().catch(() => {})));
    }
  } catch {
    // No service worker, or it refused to update — a reload is still the right move.
  }

  window.location.reload();
}
