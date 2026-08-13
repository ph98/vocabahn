/*
 * Web Push handlers for the service worker.
 *
 * WHY THIS IS A SEPARATE, HAND-WRITTEN FILE
 * -----------------------------------------
 * The PWA runs `vite-plugin-pwa` in its default `generateSW` mode: Workbox
 * writes the whole of `sw.js`, and there is no place in a generated worker to
 * put a `push` listener. The two ways out were to switch to `injectManifest`
 * and own the precache + routing setup by hand, or to keep `generateSW` and
 * have it `importScripts()` this file. We kept `generateSW`, because the parts
 * it generates are load-bearing and have already been fixed once:
 * `skipWaiting` / `clientsClaim` (a stale tab must not survive a redeploy),
 * `navigateFallbackDenylist` for `/api/` (a real past bug), and three runtime
 * caching rules that make an offline review session work. Re-implementing them
 * to add sixty lines of push handling is not a trade worth making, and issue
 * #71 is separately trimming the precache this would have disturbed.
 *
 * The cost of the choice: this file is not TypeScript, not bundled, and not
 * type-checked against `packages/shared`. Keep the payload shape below in step
 * with `pushPayloadSchema` there.
 *
 * It is wired in by `workbox.importScripts` in `apps/web/vite.config.ts`, and
 * excluded from the precache manifest (`globIgnores`) — the service worker
 * fetches it directly, so precaching it would only add a byte-identical copy.
 * nginx serves it `no-store` alongside `sw.js`, because a service worker's
 * imported scripts are served from the HTTP cache by default
 * (`updateViaCache: 'imports'`) and a cached copy would outlive its updates.
 */

/** Payload contract — mirrors `pushPayloadSchema` in `packages/shared`. */
const FALLBACK = {
  title: 'Time to study',
  body: 'You have cards waiting in Vocabahn.',
  url: '/review',
  tag: 'vocabahn-daily-reminder',
};

function readPayload(event) {
  if (!event.data) return FALLBACK;
  try {
    const parsed = event.data.json();
    return {
      title: typeof parsed.title === 'string' ? parsed.title : FALLBACK.title,
      body: typeof parsed.body === 'string' ? parsed.body : FALLBACK.body,
      // Only same-origin paths are ever opened: the URL arrives over the push
      // service and is not something to trust with an arbitrary origin.
      url: typeof parsed.url === 'string' && parsed.url.startsWith('/') ? parsed.url : FALLBACK.url,
      tag: typeof parsed.tag === 'string' ? parsed.tag : FALLBACK.tag,
    };
  } catch {
    return FALLBACK;
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event);

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // Collapse key: a reminder that was never seen is replaced by the next
      // one rather than stacking a week of them in the shade.
      tag: payload.tag,
      renotify: false,
      icon: '/icon-192.png',
      badge: '/favicon-32x32.png',
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || FALLBACK.url;
  const url = new URL(target, self.location.origin);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Reuse an open tab where we can — an installed PWA has exactly one, and
      // opening a second window over it is the wrong answer.
      for (const client of windowClients) {
        if (new URL(client.url).origin === url.origin && 'focus' in client) {
          if ('navigate' in client) {
            return client.navigate(url.href).then((navigated) => (navigated || client).focus());
          }
          return client.focus();
        }
      }
      return clients.openWindow(url.href);
    }),
  );
});
