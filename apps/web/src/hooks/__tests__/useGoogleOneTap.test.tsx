import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoogleOneTap } from '../useGoogleOneTap';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

const gsiScripts = () => Array.from(document.head.querySelectorAll(`script[src="${GSI_SRC}"]`));

/** Runs whatever the hook scheduled at idle. */
let idleCallbacks: IdleRequestCallback[] = [];
const runIdle = () => {
  const queued = idleCallbacks;
  idleCallbacks = [];
  for (const cb of queued) cb({ didTimeout: true, timeRemaining: () => 0 });
};

describe('useGoogleOneTap', () => {
  beforeEach(() => {
    idleCallbacks = [];
    // jsdom has no requestIdleCallback; capturing rather than running inline is
    // what makes "not yet" observable.
    window.requestIdleCallback = ((cb: IdleRequestCallback) => {
      idleCallbacks.push(cb);
      return idleCallbacks.length;
    }) as typeof window.requestIdleCallback;
    window.cancelIdleCallback = (() => {}) as typeof window.cancelIdleCallback;
  });

  afterEach(() => {
    for (const s of gsiScripts()) s.remove();
    delete (window as { google?: unknown }).google;
  });

  it('does not load the Google script during the first paint', () => {
    renderHook(() => useGoogleOneTap({ clientId: 'client-123', onSuccess: () => {} }));

    // The landing page's LCP window: ~97 kB of third-party JS must not be
    // competing for bandwidth here.
    expect(gsiScripts()).toHaveLength(0);
  });

  it('loads it once the browser is idle', async () => {
    renderHook(() => useGoogleOneTap({ clientId: 'client-123', onSuccess: () => {} }));

    runIdle();

    await waitFor(() => expect(gsiScripts()).toHaveLength(1));
    const script = gsiScripts()[0] as HTMLScriptElement;
    expect(script.async).toBe(true);
    expect(script.defer).toBe(true);
  });

  it('loads nothing at all when no client id is configured anywhere', () => {
    // A null prop alone is not "unconfigured": the hook falls back to the build
    // -time `VITE_GOOGLE_CLIENT_ID`, which is how a deployment without
    // `/auth/config` still gets One Tap. Both have to be empty.
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');

    renderHook(() => useGoogleOneTap({ clientId: null, onSuccess: () => {} }));

    runIdle();

    expect(gsiScripts()).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  it('survives the re-renders that inline callbacks cause', async () => {
    // Both callbacks are fresh closures on every render at every call site. If
    // the effect depended on them it would cancel and re-schedule the idle
    // callback each time, and could never actually fire.
    const { rerender } = renderHook(() =>
      useGoogleOneTap({ clientId: 'client-123', onSuccess: () => {}, onError: () => {} }),
    );

    rerender();
    rerender();
    runIdle();

    await waitFor(() => expect(gsiScripts()).toHaveLength(1));
  });

  it('initialises the prompt with the client id once the script loads', async () => {
    const initialize = vi.fn();
    const prompt = vi.fn();
    renderHook(() => useGoogleOneTap({ clientId: 'client-123', onSuccess: () => {} }));
    runIdle();

    const script = await waitFor(() => {
      const [found] = gsiScripts();
      expect(found).toBeDefined();
      return found as HTMLScriptElement;
    });

    (window as { google?: unknown }).google = { accounts: { id: { initialize, prompt } } };
    script.onload?.(new Event('load'));

    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'client-123' }));
    expect(prompt).toHaveBeenCalled();
  });
});
