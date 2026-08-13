import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  consumeNotificationSource,
  currentPermission,
  describePushSupport,
  urlBase64ToUint8Array,
} from '../../lib/push';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

/** jsdom implements none of these; each test declares the world it is in. */
function givenBrowser(options: {
  serviceWorker?: boolean;
  pushManager?: boolean;
  notification?: boolean;
  userAgent?: string;
  standalone?: boolean;
}) {
  const { serviceWorker = true, pushManager = true, notification = true } = options;

  if (serviceWorker) {
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
  } else {
    Reflect.deleteProperty(navigator, 'serviceWorker');
  }

  if (pushManager) (window as unknown as { PushManager: unknown }).PushManager = class {};
  else Reflect.deleteProperty(window, 'PushManager');

  if (notification) {
    (window as unknown as { Notification: unknown }).Notification = { permission: 'default' };
  } else {
    Reflect.deleteProperty(window, 'Notification');
  }

  Object.defineProperty(navigator, 'userAgent', {
    value: options.userAgent ?? CHROME_UA,
    configurable: true,
  });
  Object.defineProperty(navigator, 'maxTouchPoints', {
    value: options.userAgent === IPHONE_UA ? 5 : 0,
    configurable: true,
  });
  Object.defineProperty(navigator, 'standalone', {
    value: options.standalone ?? false,
    configurable: true,
  });
  window.matchMedia = ((query: string) =>
    ({ matches: false, media: query }) as MediaQueryList) as typeof window.matchMedia;
}

afterEach(() => {
  Reflect.deleteProperty(window, 'PushManager');
  Reflect.deleteProperty(window, 'Notification');
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('describePushSupport', () => {
  it('is supported in a browser with the whole Push stack', () => {
    givenBrowser({});
    expect(describePushSupport()).toEqual({ supported: true, reason: null });
  });

  it('reports a missing service worker rather than guessing', () => {
    givenBrowser({ serviceWorker: false });
    expect(describePushSupport().reason).toBe('no-service-worker');
  });

  it('names the Add-to-Home-Screen requirement on iOS Safari', () => {
    // Safari exposes PushManager only inside an installed PWA, so a plain tab
    // looks identical to an unsupported browser — and telling the user their
    // browser can't do it would be both wrong and unactionable.
    givenBrowser({ pushManager: false, userAgent: IPHONE_UA, standalone: false });
    expect(describePushSupport().reason).toBe('ios-needs-install');
  });

  it('is supported on iOS once the PWA is installed', () => {
    givenBrowser({ userAgent: IPHONE_UA, standalone: true });
    expect(describePushSupport()).toEqual({ supported: true, reason: null });
  });

  it('still refuses on iOS when the APIs are present but the app is not installed', () => {
    givenBrowser({ userAgent: IPHONE_UA, standalone: false });
    expect(describePushSupport().reason).toBe('ios-needs-install');
  });

  it('reports a desktop browser without PushManager as unsupported, not as iOS', () => {
    givenBrowser({ pushManager: false, userAgent: CHROME_UA });
    expect(describePushSupport().reason).toBe('no-push-manager');
  });
});

describe('currentPermission', () => {
  it('is “unavailable” when the Notification API is absent', () => {
    givenBrowser({ notification: false });
    expect(currentPermission()).toBe('unavailable');
  });

  it('reports the browser’s own state otherwise', () => {
    givenBrowser({});
    (window as unknown as { Notification: { permission: string } }).Notification.permission =
      'denied';
    expect(currentPermission()).toBe('denied');
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url, including the characters base64 spells differently', () => {
    // "~~~?" in base64 is "fn5+Pw=="; base64url writes it "fn5-Pw".
    expect(Array.from(urlBase64ToUint8Array('fn5-Pw'))).toEqual([126, 126, 126, 63]);
  });

  it('restores padding the VAPID key is published without', () => {
    expect(urlBase64ToUint8Array('AQAB')).toHaveLength(3);
    expect(urlBase64ToUint8Array('AQA')).toHaveLength(2);
  });
});

describe('consumeNotificationSource', () => {
  const replaceState = vi.spyOn(window.history, 'replaceState');

  afterEach(() => replaceState.mockClear());

  it('returns null on an ordinary navigation', () => {
    window.history.replaceState({}, '', '/review');
    expect(consumeNotificationSource()).toBeNull();
  });

  it('reads the marker and strips it from the address bar', () => {
    window.history.replaceState({}, '', '/review?notif=daily_reminder&deck=1');
    expect(consumeNotificationSource()).toBe('daily_reminder');
    expect(window.location.search).toBe('?deck=1');
    // Reading it twice must not double-count the session.
    expect(consumeNotificationSource()).toBeNull();
  });
});
