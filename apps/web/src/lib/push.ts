/**
 * Browser-side Web Push: what this device can do, and how to turn it on.
 *
 * Three states have to stay distinct all the way to the UI and are easy to
 * collapse by accident:
 *
 *   1. **Can this device do push at all?** — `describePushSupport()`.
 *   2. **Has the user granted permission?** — `Notification.permission`, which
 *      is per-origin, one-shot, and not ours to reset.
 *   3. **Does the user want reminders?** — the server-side preference.
 *
 * A toggle that reads only (3) will silently do nothing when (1) or (2) says
 * no, which is the specific failure this module exists to prevent.
 */

export type PushUnsupportedReason =
  | 'no-service-worker'
  | 'no-push-manager'
  | 'no-notification-api'
  | 'ios-needs-install';

export interface PushSupport {
  supported: boolean;
  reason: PushUnsupportedReason | null;
}

/** iOS and iPadOS, including iPadOS masquerading as a Mac with a touchscreen. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports "Macintosh"; the touch points are what give it away.
  return /Macintosh/.test(ua) && typeof document !== 'undefined' && navigator.maxTouchPoints > 1;
}

/** Running as an installed PWA rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // Safari's own, non-standard flag — the only one that is true on iOS.
  return (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Whether this browser can subscribe, and why not when it cannot.
 *
 * The iOS case is the one worth spelling out: Safari exposes `PushManager` only
 * to a PWA installed to the home screen, so in a plain Safari tab the APIs are
 * simply absent. Reporting that as "your browser doesn't support
 * notifications" would be both wrong and unactionable — the user is two taps
 * from it working.
 */
export function describePushSupport(): PushSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { supported: false, reason: 'no-service-worker' };
  }
  if (!('serviceWorker' in navigator)) {
    return { supported: false, reason: 'no-service-worker' };
  }
  if (!('PushManager' in window)) {
    return {
      supported: false,
      reason: isIos() && !isStandalone() ? 'ios-needs-install' : 'no-push-manager',
    };
  }
  if (!('Notification' in window)) {
    return { supported: false, reason: 'no-notification-api' };
  }
  // Every API is present but iOS still refuses to subscribe outside the
  // installed app, so say the actionable thing before the prompt is burned.
  if (isIos() && !isStandalone()) {
    return { supported: false, reason: 'ios-needs-install' };
  }
  return { supported: true, reason: null };
}

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unavailable';

export function currentPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unavailable';
  return Notification.permission;
}

/**
 * The VAPID public key is base64url; `PushManager.subscribe` wants raw bytes.
 *
 * Typed against `ArrayBuffer` rather than `Uint8Array` because the DOM's
 * `BufferSource` excludes views that could be backed by a `SharedArrayBuffer`.
 */
export function urlBase64ToUint8Array(base64UrlString: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64UrlString.length % 4)) % 4);
  const base64 = (base64UrlString + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export class PushPermissionDeniedError extends Error {
  constructor() {
    super('Notification permission was not granted');
    this.name = 'PushPermissionDeniedError';
  }
}

/**
 * Requests permission and subscribes this browser.
 *
 * **Must be called from a user gesture.** The permission prompt is one-shot per
 * origin: fire it on page load and it is denied by reflex, permanently, with no
 * way for the app to ask again. Every caller is behind an explicit
 * "Remind me daily" action for that reason alone.
 */
export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<{ endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string }> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushPermissionDeniedError();

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  // Re-use the live subscription rather than churning the endpoint: a new one
  // would orphan the row the server already holds for this browser.
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  return toSubscriptionBody(subscription);
}

/** Drops this browser's subscription; returns the endpoint it had, if any. */
export async function unsubscribeFromPush(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;
  const { endpoint } = subscription;
  await subscription.unsubscribe().catch(() => {
    // The browser can refuse; the server-side delete is what actually stops
    // delivery, so this is not worth failing the opt-out over.
  });
  return endpoint;
}

function toSubscriptionBody(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error('Browser returned an incomplete push subscription');
  }
  return {
    endpoint: json.endpoint,
    keys: { p256dh, auth },
    userAgent: navigator.userAgent.slice(0, 255),
  };
}

/**
 * Query parameter the service worker appends to the URL it opens, so a session
 * that began at a notification is attributable. Read once, then stripped from
 * the address bar — it is a signal, not part of the route.
 */
export const NOTIFICATION_SOURCE_PARAM = 'notif';

/**
 * Returns the notification kind this page load came from, and removes the
 * marker from the URL. Null on an ordinary navigation.
 */
export function consumeNotificationSource(): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const source = url.searchParams.get(NOTIFICATION_SOURCE_PARAM);
  if (!source) return null;

  url.searchParams.delete(NOTIFICATION_SOURCE_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return source;
}
