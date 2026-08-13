import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebPushError } from 'web-push';
import { PushProvider, redactEndpoint } from './push.provider';

// Hoisted so the mock factory — which vitest lifts above the imports — can see
// them. The transport is the one thing here that cannot be exercised for real.
const { sendNotification, setVapidDetails } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock('web-push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('web-push')>();
  return {
    ...actual,
    default: { sendNotification, setVapidDetails },
    WebPushError: actual.WebPushError,
  };
});

const TARGET = { endpoint: 'https://push.example.com/abc123', p256dh: 'k', auth: 'a' };
const PAYLOAD = { title: 't', body: 'b', url: '/review', tag: 'tag' };

/** Constructs the error shape the push services actually return. */
function webPushError(statusCode: number) {
  return new WebPushError('failed', statusCode, {}, '', TARGET.endpoint);
}

describe('PushProvider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = 'public';
    process.env.VAPID_PRIVATE_KEY = 'private';
    process.env.VAPID_SUBJECT = 'mailto:dev@example.com';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('is disabled with no keys, and says so instead of throwing', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const provider = new PushProvider();

    expect(provider.enabled).toBe(false);
    expect(provider.applicationServerKey).toBeNull();
    expect(await provider.send(TARGET, PAYLOAD)).toBe('disabled');
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('is disabled when only half the pair is set', () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect(new PushProvider().enabled).toBe(false);
  });

  it('publishes the public key for PushManager.subscribe once configured', () => {
    expect(new PushProvider().applicationServerKey).toBe('public');
  });

  it('sends the payload as JSON and configures VAPID exactly once', async () => {
    const provider = new PushProvider();
    sendNotification.mockResolvedValue({ statusCode: 201 });

    expect(await provider.send(TARGET, PAYLOAD)).toBe('sent');
    expect(await provider.send(TARGET, PAYLOAD)).toBe('sent');

    expect(setVapidDetails).toHaveBeenCalledTimes(1);
    const [subscription, body] = sendNotification.mock.calls[0]!;
    expect(subscription).toEqual({
      endpoint: TARGET.endpoint,
      keys: { p256dh: 'k', auth: 'a' },
    });
    expect(JSON.parse(body as string)).toEqual(PAYLOAD);
  });

  it('reports a 410 Gone as a dead subscription, so the caller can prune it', async () => {
    const provider = new PushProvider();
    sendNotification.mockRejectedValue(webPushError(410));
    expect(await provider.send(TARGET, PAYLOAD)).toBe('gone');
  });

  it('treats 404 the same way — some services answer that instead', async () => {
    const provider = new PushProvider();
    sendNotification.mockRejectedValue(webPushError(404));
    expect(await provider.send(TARGET, PAYLOAD)).toBe('gone');
  });

  it('keeps a subscription that hit a transient error', async () => {
    const provider = new PushProvider();
    sendNotification.mockRejectedValue(webPushError(503));
    expect(await provider.send(TARGET, PAYLOAD)).toBe('failed');
  });

  it('never throws, whatever the transport does', async () => {
    const provider = new PushProvider();
    sendNotification.mockRejectedValue(new Error('socket hang up'));
    await expect(provider.send(TARGET, PAYLOAD)).resolves.toBe('failed');
  });
});

describe('redactEndpoint', () => {
  it('keeps enough to tell two endpoints apart and no more', () => {
    // An endpoint is bearer-ish: anyone holding it can push to that device.
    expect(redactEndpoint('https://fcm.googleapis.com/fcm/send/LONGSECRETVALUE')).toBe(
      'https://fcm.googleapis.com/…RETVALUE',
    );
  });

  it('does not leak a malformed endpoint either', () => {
    expect(redactEndpoint('not a url')).toBe('…');
  });
});
