import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiUnavailableError, api, fetchMe } from '../../api';
import {
  SESSION_QUERY_KEY,
  installSessionQueryDefaults,
  isRetryableSessionFailure,
  sessionRetryDelay,
  shouldRetrySession,
  useSession,
} from '../useSession';

const USER = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
  avatarUrl: null,
  cefrLevel: null,
  interests: [],
};

/** An axios rejection: with `status` the API answered, without it the request never landed. */
function apiFailure(status?: number): AxiosError {
  const error = new AxiosError(
    status === undefined ? 'Network Error' : `Request failed with status code ${status}`,
    status === undefined ? 'ERR_NETWORK' : 'ERR_BAD_RESPONSE',
  );
  if (status !== undefined) {
    error.response = { status, data: {}, statusText: '', headers: {}, config: {} } as AxiosResponse;
  }
  return error;
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Nothing retries here — retry behaviour has its own tests, with its own client. */
function testClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchMe', () => {
  it('returns the user when the API answers', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: USER });

    await expect(fetchMe()).resolves.toMatchObject({ id: 'user-1' });
  });

  it('returns null on a 401 the silent refresh cannot rescue — the session really is over', async () => {
    const get = vi.spyOn(api, 'get').mockRejectedValue(apiFailure(401));
    const post = vi.spyOn(api, 'post').mockRejectedValue(apiFailure(401));

    await expect(fetchMe()).resolves.toBeNull();
    expect(post).toHaveBeenCalledWith('/auth/refresh');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('returns the user when a 401 is only an expired access token', async () => {
    vi.spyOn(api, 'get')
      .mockRejectedValueOnce(apiFailure(401))
      .mockResolvedValueOnce({ data: USER });
    vi.spyOn(api, 'post').mockResolvedValue({ data: {} });

    await expect(fetchMe()).resolves.toMatchObject({ id: 'user-1' });
  });

  it('throws rather than reporting a sign-out when the API never answers', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(apiFailure());
    const post = vi.spyOn(api, 'post');

    await expect(fetchMe()).rejects.toBeInstanceOf(ApiUnavailableError);
    // A failed connection is not a 401, so nothing should have tried to refresh.
    expect(post).not.toHaveBeenCalled();
  });

  it('throws on a 5xx, carrying the status', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(apiFailure(503));

    await expect(fetchMe()).rejects.toMatchObject({ name: 'ApiUnavailableError', status: 503 });
  });

  it('throws on a throttler 429 instead of signing the user out', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(apiFailure(429));

    await expect(fetchMe()).rejects.toMatchObject({ name: 'ApiUnavailableError', status: 429 });
  });

  it('throws on a refresh that fails for a reason other than the session', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(apiFailure(401));
    vi.spyOn(api, 'post').mockRejectedValue(apiFailure(502));

    await expect(fetchMe()).rejects.toMatchObject({ name: 'ApiUnavailableError', status: 502 });
  });

  it('lets a schema mismatch through untouched rather than dressing it as an outage', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { id: 42 } });

    await expect(fetchMe()).rejects.not.toBeInstanceOf(ApiUnavailableError);
  });
});

describe('session retry policy', () => {
  it('retries what might come good and nothing else', () => {
    expect(isRetryableSessionFailure(new ApiUnavailableError('no answer'))).toBe(true);
    expect(isRetryableSessionFailure(new ApiUnavailableError('x', { status: 503 }))).toBe(true);
    expect(isRetryableSessionFailure(new ApiUnavailableError('x', { status: 429 }))).toBe(true);
    expect(isRetryableSessionFailure(new ApiUnavailableError('x', { status: 404 }))).toBe(false);
    expect(isRetryableSessionFailure(new Error('boom'))).toBe(false);
  });

  it('gives up after a bounded number of attempts', () => {
    expect(shouldRetrySession(0, new ApiUnavailableError('no answer'))).toBe(true);
    expect(shouldRetrySession(2, new ApiUnavailableError('no answer'))).toBe(true);
    expect(shouldRetrySession(3, new ApiUnavailableError('no answer'))).toBe(false);
  });

  it('backs off exponentially, capped', () => {
    expect(sessionRetryDelay(0)).toBe(1000);
    expect(sessionRetryDelay(1)).toBe(2000);
    expect(sessionRetryDelay(2)).toBe(4000);
    expect(sessionRetryDelay(20)).toBe(30_000);
  });

  it('installs itself on every observer of the session key', () => {
    const client = new QueryClient();
    installSessionQueryDefaults(client);

    const defaults = client.getQueryDefaults(SESSION_QUERY_KEY);
    expect(defaults.retry).toBe(shouldRetrySession);
    expect(defaults.retryDelay).toBe(sessionRetryDelay);
  });

  it('stops after four requests during an outage instead of hammering the API', async () => {
    const get = vi.spyOn(api, 'get').mockRejectedValue(apiFailure());
    const client = new QueryClient();
    installSessionQueryDefaults(client);
    // Same policy, without spending the real backoff in a test.
    client.setQueryDefaults(SESSION_QUERY_KEY, { retry: shouldRetrySession, retryDelay: 0 });

    await expect(client.fetchQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchMe })).rejects.toBeInstanceOf(
      ApiUnavailableError,
    );
    expect(get).toHaveBeenCalledTimes(4);
  });

  it('does not retry a 4xx, which is an answer rather than an outage', async () => {
    const get = vi.spyOn(api, 'get').mockRejectedValue(apiFailure(404));
    const client = new QueryClient();
    installSessionQueryDefaults(client);
    client.setQueryDefaults(SESSION_QUERY_KEY, { retry: shouldRetrySession, retryDelay: 0 });

    await expect(client.fetchQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchMe })).rejects.toBeTruthy();
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('useSession', () => {
  function renderSession(client = testClient()) {
    return renderHook(() => useSession(), { wrapper: wrapper(client) });
  }

  it('reports a confirmed sign-out as anonymous', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(apiFailure(401));
    vi.spyOn(api, 'post').mockRejectedValue(apiFailure(401));

    const { result } = renderSession();

    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(result.current.user).toBeNull();
  });

  it('reports a signed-in user as authenticated', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: USER });

    const { result } = renderSession();

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user).toMatchObject({ id: 'user-1' });
  });

  it('reports a network failure as unreachable, never as anonymous', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(apiFailure());

    const { result } = renderSession();

    await waitFor(() => expect(result.current.status).toBe('unreachable'));
    expect(result.current.error).toBeInstanceOf(ApiUnavailableError);
  });

  it('reports a 5xx as unreachable', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(apiFailure(500));

    const { result } = renderSession();

    await waitFor(() => expect(result.current.status).toBe('unreachable'));
  });

  it('keeps the user signed in through a throttler 429', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: USER });
    const { result } = renderSession();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    get.mockRejectedValue(apiFailure(429));
    result.current.recheck();

    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiUnavailableError));
    expect(result.current.status).toBe('authenticated');
    expect(result.current.user).toMatchObject({ id: 'user-1' });
  });

  it('keeps the last known user through an outage so nothing has to sign in again', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: USER });
    const { result } = renderSession();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    get.mockRejectedValue(apiFailure());
    result.current.recheck();
    await waitFor(() => expect(result.current.status).toBe('unreachable'));
    expect(result.current.user).toMatchObject({ id: 'user-1' });

    get.mockResolvedValue({ data: USER });
    result.current.recheck();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
  });

  it('blames the device, not the server, when the browser is offline', async () => {
    const onLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    vi.spyOn(api, 'get').mockRejectedValue(apiFailure());

    try {
      const { result } = renderSession();
      await waitFor(() => expect(result.current.status).toBe('offline'));
    } finally {
      if (onLine) Object.defineProperty(Navigator.prototype, 'onLine', onLine);
      Reflect.deleteProperty(navigator, 'onLine');
    }
  });
});
