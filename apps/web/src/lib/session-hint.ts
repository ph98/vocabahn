/**
 * A one-bit memory of whether this device has ever held a session.
 *
 * It exists for one reason: the landing page used to wait for a network round
 * trip. The shell renders nothing while `['me']` is in flight, so a signed-out
 * visitor's first paint was the background and the footer, and the marketing
 * page — and with it LCP — only arrived after `/auth/me` answered. Measured on
 * a throttled mobile profile that was about two seconds of the gap between FCP
 * and LCP, and a layout shift as the footer was pushed down the page.
 *
 * The session cookie is `httpOnly`, so the client cannot read it. This is the
 * next best thing: a marker written whenever the API confirms a user and
 * cleared whenever it confirms there is none. Absent, the odds that this
 * request carries a valid session are very low, so the shell renders the
 * landing page immediately rather than waiting to be told.
 *
 * It is a rendering hint and **never** an authorisation signal. Nothing is
 * unlocked by its presence: the routes still mount only on a confirmed
 * `authenticated` status, and a stale marker costs a returning signed-out
 * visitor exactly what everyone got before — a wait for the real answer.
 */

const KEY = 'vocabahn-session-hint';

/**
 * True when a session has been confirmed on this device before.
 *
 * Fails closed: if storage is unavailable (private mode, a blocked origin) it
 * answers `true`, which is the conservative branch — the shell waits for the
 * API rather than flashing the landing page at someone who may be signed in.
 */
export function hasKnownSession(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    return true;
  }
}

/** Records what the API just said about the session. */
export function rememberSession(signedIn: boolean): void {
  try {
    if (signedIn) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    // A device that will not store this just gets the old behaviour.
  }
}
