import { redactPagePath } from './telemetry';

/**
 * The product feedback widget: a thin adapter over Usersnap's global script.
 *
 * Everything about the third party is behind this module. Callers ask three
 * questions — is it configured, load it, open it — and never see a script tag,
 * a global callback or a vendor API shape.
 *
 * Two contracts hold whatever happens:
 *
 * - **Unconfigured is a normal state.** With `VITE_USERSNAP_API_KEY` unset,
 *   every function here is a no-op: no script, no trigger, no thrown error and
 *   no console output. Same rule the server-side providers follow
 *   (`UnsplashProvider.enabled`).
 * - **Nothing loads without consent.** This module does not read consent
 *   itself; `ProductFeedbackTrigger` is the only caller and it will not call
 *   `loadFeedbackWidget` until analytics consent is granted, and calls
 *   `unloadFeedbackWidget` when it is withdrawn.
 *
 * State is module-level rather than per-component on purpose: React StrictMode
 * mounts the trigger twice in development, and two `<script>` tags would mean
 * two widgets.
 */

/**
 * The Usersnap "API event" that opens the widget. It must match an API-event
 * trigger configured in the Usersnap project, whose audience is set to
 * *Nobody* so Usersnap never renders a button of its own — the app owns the
 * trigger, which is what makes its placement and accessible name ours to fix.
 */
export const FEEDBACK_OPEN_EVENT = 'vocabahn_product_feedback';

/** Name of the `window` function Usersnap's loader calls back into. */
const GLOBAL_CALLBACK = 'onVocabahnUsersnapLoad';

/** `id` on the injected script, so `unloadFeedbackWidget` can find it again. */
const SCRIPT_ID = 'vb-feedback-widget';

/** How long to wait for an idle moment before giving up and loading anyway. */
const IDLE_TIMEOUT_MS = 3000;

/** Fallback delay where `requestIdleCallback` is missing (Safari < 17). */
const IDLE_FALLBACK_MS = 1200;

/**
 * What every report carries alongside whatever the person wrote.
 *
 * Deliberately a route, a build and a screen size — never an account id, an
 * email or a headword. `route` is passed through `redactPagePath`, the same
 * redaction GA4 gets, so `/word/Haus` is reported as `/word/:word`.
 */
export interface FeedbackContext {
  /** Redacted route, e.g. `/word/:word`. */
  route: string;
  /** Build version — the same string the footer links to the changelog with. */
  app_version: string;
  /** CSS-pixel viewport, `"375x812"`. Tells a wide layout bug from a narrow one. */
  viewport: string;
  /**
   * Whether a session exists. Always `true` today: the trigger does not mount
   * for signed-out visitors, so the landing page never loads the widget.
   */
  signed_in: boolean;
}

/** Builds the context for a report opened now, on `pathname`. */
export function buildFeedbackContext(pathname: string, signedIn: boolean): FeedbackContext {
  return {
    route: redactPagePath(pathname),
    app_version: __APP_VERSION__,
    viewport: typeof window === 'undefined' ? 'unknown' : `${window.innerWidth}x${window.innerHeight}`,
    signed_in: signedIn,
  };
}

export interface FeedbackWidgetHandlers {
  /** Read at open time, not at load time, so the route is the one being reported. */
  getContext: () => FeedbackContext;
  /** The widget actually opened. */
  onOpen?: () => void;
  /** A report was submitted. */
  onSubmit?: () => void;
}

/** The slice of Usersnap's `GlobalApi` this app uses. */
interface UsersnapGlobalApi {
  init: (options?: Record<string, unknown>) => Promise<void> | void;
  destroy: () => Promise<void> | void;
  logEvent: (eventName: string) => Promise<void> | void;
  on: (eventName: string, callback: (event: UsersnapWidgetEvent) => void) => void;
}

interface UsersnapWidgetEvent {
  api?: { setValue: (key: string, value: unknown) => void };
}

type LoadState = 'idle' | 'loading' | 'ready' | 'unavailable';

let loadState: LoadState = 'idle';
let widgetApi: UsersnapGlobalApi | null = null;
let handlers: FeedbackWidgetHandlers | null = null;
let cancelIdle: (() => void) | null = null;
/** A click that arrived before the deferred script finished loading. */
let openWhenReady = false;

/** The configured Space API key, or undefined when the widget is switched off. */
function feedbackApiKey(): string | undefined {
  const key = import.meta.env.VITE_USERSNAP_API_KEY?.trim();
  return key ? key : undefined;
}

/**
 * True when a provider key is present. False is the normal state in
 * development and in any deployment that has not been given a key — the app
 * behaves identically, minus the trigger.
 */
export function isFeedbackWidgetConfigured(): boolean {
  return feedbackApiKey() !== undefined;
}

/** Runs `fn` when the browser is idle; returns a cancel. */
function whenIdle(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(fn, IDLE_FALLBACK_MS);
  return () => window.clearTimeout(handle);
}

/** Swallows a rejected vendor promise. A broken widget must not break the app. */
function ignoreFailure(result: Promise<void> | void): void {
  if (result instanceof Promise) result.catch(() => {});
}

function injectScript(apiKey: string): void {
  const globals = window as unknown as Record<string, unknown>;

  globals[GLOBAL_CALLBACK] = (api: UsersnapGlobalApi) => {
    widgetApi = api;

    api.on('open', (event) => {
      // Set on open rather than on init: `init` runs once per page load, and
      // the route it captured would be stale by the time anyone clicks.
      event.api?.setValue('custom', handlers?.getContext());
      handlers?.onOpen?.();
    });
    api.on('submit', () => handlers?.onSubmit?.());

    try {
      const initialised = api.init({
        // No `user` block: a report is tied to a route and a build, not to a
        // person. Nothing here identifies the account.
        custom: handlers?.getContext(),
        // Usersnap otherwise geolocates the reporter's IP. Nothing in a bug
        // report needs it.
        collectGeoLocation: 'none',
      });
      if (initialised instanceof Promise) {
        initialised.then(markReady, () => {
          loadState = 'unavailable';
        });
      } else {
        markReady();
      }
    } catch {
      loadState = 'unavailable';
    }
  };

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.defer = true;
  script.src = `https://widget.usersnap.com/global/load/${encodeURIComponent(apiKey)}?onload=${GLOBAL_CALLBACK}`;
  // Blocked by an extension, offline, or the vendor is down: the app is fine
  // without it, so this is recorded and never logged.
  script.onerror = () => {
    loadState = 'unavailable';
  };
  document.head.appendChild(script);
}

function markReady(): void {
  loadState = 'ready';
  if (openWhenReady) {
    openWhenReady = false;
    openFeedbackWidget();
  }
}

/**
 * Injects the widget script, once, at the next idle moment.
 *
 * Idempotent: calling again only refreshes the handlers. Returns immediately
 * when no key is configured.
 */
export function loadFeedbackWidget(nextHandlers: FeedbackWidgetHandlers): void {
  handlers = nextHandlers;

  const apiKey = feedbackApiKey();
  if (!apiKey || typeof document === 'undefined') return;
  if (loadState !== 'idle') return;

  loadState = 'loading';
  cancelIdle = whenIdle(() => {
    cancelIdle = null;
    injectScript(apiKey);
  });
}

/**
 * Opens the feedback dialog. A click that lands while the deferred script is
 * still in flight is remembered and honoured once it arrives, rather than
 * being dropped — the alternative is a button that does nothing on a slow
 * connection.
 */
export function openFeedbackWidget(): void {
  if (loadState === 'ready' && widgetApi) {
    ignoreFailure(widgetApi.logEvent(FEEDBACK_OPEN_EVENT));
    return;
  }
  if (loadState === 'loading') openWhenReady = true;
}

/**
 * Tears the widget down and returns this module to its pre-load state.
 *
 * The production caller is consent withdrawal: GDPR consent is revocable, and
 * revoking it has to remove the third party rather than merely hide its
 * button. Tests use it to reset the module singleton between cases.
 */
export function unloadFeedbackWidget(): void {
  cancelIdle?.();
  cancelIdle = null;

  if (widgetApi) {
    try {
      ignoreFailure(widgetApi.destroy());
    } catch {
      // A vendor teardown that throws is not the app's problem.
    }
  }

  widgetApi = null;
  handlers = null;
  openWhenReady = false;
  loadState = 'idle';

  if (typeof document !== 'undefined') document.getElementById(SCRIPT_ID)?.remove();
  if (typeof window !== 'undefined') {
    delete (window as unknown as Record<string, unknown>)[GLOBAL_CALLBACK];
  }
}
