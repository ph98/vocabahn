import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { User } from '@vocabahn/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiUnavailableError, fetchMe } from '../api';
import { hasKnownSession, rememberSession } from '../lib/session-hint';
import { useOnlineStatus } from '../offline/useOnlineStatus';

/** The one key the whole app reads the session from. */
export const SESSION_QUERY_KEY = ['me'] as const;

/** Attempts after the first before the app admits it cannot reach the API. */
const MAX_SESSION_RETRIES = 3;

/**
 * True for failures that might still come good: the API never answered, it
 * answered 5xx, or the throttler answered 429. A 4xx is an answer about the
 * request itself, and repeating it would only spend quota.
 */
export function isRetryableSessionFailure(error: unknown): boolean {
  if (!(error instanceof ApiUnavailableError)) return false;
  if (error.status === undefined) return true;
  if (error.status === 429) return true;
  return error.status >= 500;
}

/** react-query's `retry`: bounded, and never against a 4xx. */
export function shouldRetrySession(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_SESSION_RETRIES && isRetryableSessionFailure(error);
}

/** react-query's `retryDelay`: 1 s, 2 s, 4 s … capped at 30 s. */
export function sessionRetryDelay(failureCount: number): number {
  return Math.min(1000 * 2 ** failureCount, 30_000);
}

/**
 * Installs the session retry policy on the query client, once, at startup.
 *
 * It lives here rather than on the `useQuery` call because several components
 * observe `['me']` — the shell, the nav, the error pages — and per-observer
 * retry options would silently disagree about which one is in charge of a
 * shared fetch. Query defaults apply to every observer of the key at once.
 */
export function installSessionQueryDefaults(client: QueryClient): void {
  client.setQueryDefaults(SESSION_QUERY_KEY, {
    retry: shouldRetrySession,
    retryDelay: sessionRetryDelay,
  });
}

/**
 * What the shell knows about who is using it.
 *
 * - `loading` — the first check has not settled yet.
 * - `authenticated` — a user, from a check that succeeded at some point.
 * - `anonymous` — the API confirmed there is no session.
 * - `offline` — the device has no connection and we have never met this user.
 * - `unreachable` — the API could not tell us, so the answer is unknown.
 *
 * `unreachable` is the state this whole module exists for: it is emphatically
 * not `anonymous`, and must never be rendered as a sign-in prompt.
 */
export type SessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'offline' | 'unreachable';

export interface Session {
  status: SessionStatus;
  /**
   * The last user the API confirmed. Survives an outage on purpose — the
   * cookie is still valid, so there is nothing to sign out of — which is why
   * it can be non-null while `status` is `unreachable`.
   */
  user: User | null;
  /**
   * The last failed check, or `null` once one succeeds. What `unreachable` is
   * about; also set, and deliberately not acted on, while a throttled 429 is
   * backing off behind a still-signed-in user.
   */
  error: unknown;
  /** True while a session request is in flight, retries included. */
  isChecking: boolean;
  /** Check again now. The manual half of the recovery path. */
  recheck: () => void;
  /**
   * Whether a session has ever been confirmed on this device
   * (`lib/session-hint.ts`).
   *
   * Only meaningful while `status` is `loading`, and only as a rendering hint:
   * it lets the shell put the landing page on screen straight away for a
   * visitor who has plainly never signed in, instead of holding first paint for
   * a round trip. It authorises nothing — the routes still wait for
   * `authenticated`.
   */
  hasKnownSession: boolean;
}

/**
 * The signed-in user, for components that only render inside the app shell and
 * therefore already know the session resolved. Shares the shell's query, so it
 * costs no extra request.
 */
export function useSessionUser(): User | null {
  const { data } = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchMe });
  return data ?? null;
}

/**
 * The auth gate's three-way answer — signed in, signed out, or unknown.
 *
 * Retry and backoff are configured by {@link installSessionQueryDefaults}, not
 * here.
 */
export function useSession(): Session {
  const online = useOnlineStatus();
  const query = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchMe });
  const { refetch } = query;
  const recheck = useCallback(() => void refetch(), [refetch]);

  // react-query resets a data-less query to `pending` for the duration of every
  // retry, so `isError` blinks off each time we check again. Latching the last
  // failure keeps the outage state on screen — with its spinner — instead of
  // unmounting and remounting it once per attempt.
  const [failure, setFailure] = useState<unknown>(null);
  const { isError, isSuccess, error } = query;
  useEffect(() => {
    if (isError) setFailure(error);
    else if (isSuccess) setFailure(null);
  }, [isError, isSuccess, error]);

  // Read once, at mount: the marker is only consulted while the first check is
  // in flight, and re-reading it mid-flight would let the answer change under a
  // render that has already committed to a branch.
  const [knownSession] = useState(hasKnownSession);

  // Only a *confirmed* answer updates the marker. A failure says nothing about
  // the session — clearing it on a 502 would hand the next load a landing-page
  // flash for a user whose cookie is perfectly valid, which is the same bug
  // #76 fixed one layer up.
  const confirmedUser = isSuccess ? query.data ?? null : undefined;
  useEffect(() => {
    if (confirmedUser !== undefined) rememberSession(confirmedUser !== null);
  }, [confirmedUser]);

  // `undefined` means we have never had an answer; `null` is an answer, and it
  // is retained across a later failure, which is what lets a signed-out visitor
  // keep the landing page through an outage.
  const user = query.data ?? null;
  const signedOut = query.data === null;
  const base = {
    user,
    error: failure,
    isChecking: query.isFetching,
    recheck,
    hasKnownSession: knownSession,
  };

  // No connection: react-query pauses instead of failing, so there is no outage
  // to report. Keep anyone we already know signed in — the review queue and the
  // dictionary cache are exactly what still works here.
  if (!online) {
    if (user) return { ...base, status: 'authenticated' };
    return { ...base, status: signedOut ? 'anonymous' : 'offline' };
  }

  // A check that has actually landed beats anything latched from before it.
  if (isSuccess) return { ...base, status: user ? 'authenticated' : 'anonymous' };

  if (failure && !signedOut) {
    // A 429 is the throttler pacing us, not an outage, and must never take a
    // signed-in user out of the app. The query is already backing off.
    const throttled = failure instanceof ApiUnavailableError && failure.status === 429;
    if (!(throttled && user)) return { ...base, status: 'unreachable' };
  }

  if (user) return { ...base, status: 'authenticated' };
  if (signedOut) return { ...base, status: 'anonymous' };
  return { ...base, status: 'loading' };
}
