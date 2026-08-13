/**
 * `isAnalyticsEnabled()` refuses to run on localhost, which is where jsdom
 * serves from by default — every consent assertion would otherwise pass
 * vacuously. A production-looking origin makes the gate under test the consent
 * gate rather than the environment gate.
 *
 * @vitest-environment-options { "url": "https://vocabahn.app/dashboard" }
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductFeedbackTrigger } from '../ProductFeedbackTrigger';
import { FEEDBACK_OPEN_EVENT, unloadFeedbackWidget } from '../../lib/feedback-widget';
import { setStoredConsent } from '../../lib/telemetry';

const API_KEY = 'usersnap-test-key';
const SCRIPT_ID = 'vb-feedback-widget';
const GLOBAL_CALLBACK = 'onVocabahnUsersnapLoad';

/** The vendor's global API, as far as this app uses it. */
function fakeUsersnap() {
  const listeners = new Map<string, (event: unknown) => void>();
  return {
    init: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    logEvent: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((name: string, cb: (event: unknown) => void) => listeners.set(name, cb)),
    emit: (name: string, event: unknown) => listeners.get(name)?.(event),
  };
}

const injectedScript = () => document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

/** Runs the vendor loader's callback, as the real script would once fetched. */
async function completeLoad(api: ReturnType<typeof fakeUsersnap>) {
  const load = (window as unknown as Record<string, unknown>)[GLOBAL_CALLBACK] as
    | ((api: unknown) => void)
    | undefined;
  expect(load).toBeTypeOf('function');
  load?.(api);
  // `init` resolves a promise before the widget is marked ready.
  await vi.waitFor(() => expect(api.init).toHaveBeenCalled());
  await Promise.resolve();
  await Promise.resolve();
}

function renderTrigger(ui: ReactElement, route = '/') {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

/** Every gtag event that was sent, as [name, params] pairs. */
function eventsFrom(gtag: ReturnType<typeof vi.fn>): [string, Record<string, unknown>][] {
  return gtag.mock.calls
    .filter((call) => call[0] === 'event')
    .map((call) => [call[1] as string, call[2] as Record<string, unknown>]);
}

const gtagMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  unloadFeedbackWidget();
  gtagMock.mockClear();
  window.gtag = gtagMock;
  vi.stubEnv('MODE', 'production');
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_USERSNAP_API_KEY', API_KEY);
  // jsdom has no requestIdleCallback; running it inline keeps the deferral
  // real in production and synchronous here.
  window.requestIdleCallback = ((cb: IdleRequestCallback) => {
    cb({ didTimeout: false, timeRemaining: () => 50 });
    return 1;
  }) as typeof window.requestIdleCallback;
  window.cancelIdleCallback = (() => {}) as typeof window.cancelIdleCallback;
});

afterEach(() => {
  unloadFeedbackWidget();
  vi.unstubAllEnvs();
  delete window.gtag;
});

describe('ProductFeedbackTrigger — when it may exist at all', () => {
  it('renders nothing and fetches nothing while consent is pending', () => {
    renderTrigger(<ProductFeedbackTrigger signedIn />);

    expect(screen.queryByRole('button', { name: 'Feedback' })).not.toBeInTheDocument();
    expect(injectedScript()).toBeNull();
  });

  it('renders nothing and fetches nothing once consent is denied', () => {
    setStoredConsent('denied');
    renderTrigger(<ProductFeedbackTrigger signedIn />);

    expect(screen.queryByRole('button', { name: 'Feedback' })).not.toBeInTheDocument();
    expect(injectedScript()).toBeNull();
  });

  it('renders nothing and fetches nothing when no provider key is configured', () => {
    vi.stubEnv('VITE_USERSNAP_API_KEY', '');
    setStoredConsent('granted');

    renderTrigger(<ProductFeedbackTrigger signedIn />);

    expect(screen.queryByRole('button', { name: 'Feedback' })).not.toBeInTheDocument();
    expect(injectedScript()).toBeNull();
  });

  it('renders nothing for a signed-out visitor, so the landing page stays clean', () => {
    setStoredConsent('granted');
    renderTrigger(<ProductFeedbackTrigger signedIn={false} />);

    expect(screen.queryByRole('button', { name: 'Feedback' })).not.toBeInTheDocument();
    expect(injectedScript()).toBeNull();
  });

  it('is suppressed during a review session', () => {
    setStoredConsent('granted');
    renderTrigger(<ProductFeedbackTrigger signedIn />, '/review');

    expect(screen.queryByRole('button', { name: 'Feedback' })).not.toBeInTheDocument();
    expect(injectedScript()).toBeNull();
  });

  it('appears with consent granted, loading the vendor script from the configured key', () => {
    setStoredConsent('granted');
    renderTrigger(<ProductFeedbackTrigger signedIn />);

    expect(screen.getByRole('button', { name: 'Feedback' })).toBeInTheDocument();
    expect(injectedScript()?.src).toContain(`/global/load/${API_KEY}`);
    expect(injectedScript()?.defer).toBe(true);
  });

  it('appears the moment consent is granted, without a reload', async () => {
    renderTrigger(<ProductFeedbackTrigger signedIn />);
    expect(screen.queryByRole('button', { name: 'Feedback' })).not.toBeInTheDocument();

    setStoredConsent('granted');

    expect(await screen.findByRole('button', { name: 'Feedback' })).toBeInTheDocument();
    expect(injectedScript()).not.toBeNull();
  });

  it('tears the widget down when consent is withdrawn', async () => {
    setStoredConsent('granted');
    const api = fakeUsersnap();
    renderTrigger(<ProductFeedbackTrigger signedIn />);
    await completeLoad(api);

    setStoredConsent('denied');

    await vi.waitFor(() => expect(api.destroy).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Feedback' })).not.toBeInTheDocument();
    expect(injectedScript()).toBeNull();
  });

  it('has an accessible name and no axe violations', async () => {
    setStoredConsent('granted');
    const { container } = renderTrigger(<ProductFeedbackTrigger signedIn />);

    expect(screen.getByRole('button', { name: 'Feedback' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('ProductFeedbackTrigger — opening and reporting', () => {
  it('opens the widget through the configured API event', async () => {
    const user = userEvent.setup();
    setStoredConsent('granted');
    const api = fakeUsersnap();
    renderTrigger(<ProductFeedbackTrigger signedIn />);
    await completeLoad(api);

    await user.click(screen.getByRole('button', { name: 'Feedback' }));

    expect(api.logEvent).toHaveBeenCalledWith(FEEDBACK_OPEN_EVENT);
  });

  it('honours a click that lands before the deferred script has loaded', async () => {
    const user = userEvent.setup();
    setStoredConsent('granted');
    const api = fakeUsersnap();
    renderTrigger(<ProductFeedbackTrigger signedIn />);

    await user.click(screen.getByRole('button', { name: 'Feedback' }));
    expect(api.logEvent).not.toHaveBeenCalled();

    await completeLoad(api);

    expect(api.logEvent).toHaveBeenCalledWith(FEEDBACK_OPEN_EVENT);
  });

  it('attaches route, app version, viewport and signed-in state to the report', async () => {
    setStoredConsent('granted');
    const api = fakeUsersnap();
    renderTrigger(<ProductFeedbackTrigger signedIn />, '/word/Haus');
    await completeLoad(api);

    const setValue = vi.fn();
    api.emit('open', { api: { setValue } });

    expect(setValue).toHaveBeenCalledWith('custom', {
      // The headword is redacted exactly as it is for GA4.
      route: '/word/:word',
      app_version: __APP_VERSION__,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      signed_in: true,
    });
    expect(JSON.stringify(setValue.mock.calls)).not.toContain('Haus');
  });

  it('reports open and submit through the typed analytics taxonomy', async () => {
    setStoredConsent('granted');
    const api = fakeUsersnap();
    renderTrigger(<ProductFeedbackTrigger signedIn />);
    await completeLoad(api);
    gtagMock.mockClear();

    api.emit('open', { api: { setValue: vi.fn() } });
    api.emit('submit', {});

    expect(eventsFrom(gtagMock)).toEqual([
      ['product_feedback_open', {}],
      ['product_feedback_submit', {}],
    ]);
  });
});
