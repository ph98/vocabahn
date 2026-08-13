/**
 * `isAnalyticsEnabled()` refuses to run on localhost, which is where jsdom
 * serves from by default — so every consent assertion would pass vacuously.
 * Give this file a production-looking origin so the gate under test is the
 * consent gate and not the environment gate.
 *
 * @vitest-environment-options { "url": "https://vocabahn.app/dashboard" }
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getStoredConsent,
  isAnalyticsAllowed,
  redactPagePath,
  setStoredConsent,
  trackEvent,
  trackPageView,
} from '../../lib/telemetry';

/** Every gtag call that sent an event, as [name, params] pairs. */
function eventsFrom(gtag: ReturnType<typeof vi.fn>): [string, Record<string, unknown>][] {
  return gtag.mock.calls
    .filter((call) => call[0] === 'event')
    .map((call) => [call[1] as string, call[2] as Record<string, unknown>]);
}

describe('Telemetry & GDPR Consent', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.gtag;
    delete window.dataLayer;
    // Vitest runs as MODE=test/DEV=true, which isAnalyticsEnabled() treats as
    // "never send anything". Production-like values make the gate meaningful.
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('DEV', false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults stored consent to pending when nothing in localStorage', () => {
    expect(getStoredConsent()).toBe('pending');
  });

  it('stores and updates consent state correctly', () => {
    const gtagMock = vi.fn();
    window.gtag = gtagMock;

    setStoredConsent('granted');
    expect(getStoredConsent()).toBe('granted');
    expect(localStorage.getItem('vocabahn_consent')).toBe('granted');
    expect(gtagMock).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  });

  it('updates consent to denied', () => {
    const gtagMock = vi.fn();
    window.gtag = gtagMock;

    setStoredConsent('denied');
    expect(getStoredConsent()).toBe('denied');
    expect(localStorage.getItem('vocabahn_consent')).toBe('denied');
    expect(gtagMock).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  });
});

describe('Telemetry consent gate', () => {
  const gtagMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    gtagMock.mockClear();
    window.gtag = gtagMock;
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('DEV', false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends nothing at all while consent is pending', () => {
    expect(getStoredConsent()).toBe('pending');
    expect(isAnalyticsAllowed()).toBe(false);

    trackPageView('/dashboard', 'Dashboard');
    trackEvent('login', { method: 'google' });
    trackEvent('review_session_complete', {
      card_count: 12,
      again_count: 1,
      hard_count: 2,
      good_count: 6,
      easy_count: 3,
      accuracy_pct: 75,
      duration_sec: 240,
      offline_queued_count: 0,
      session_scope: 'all',
    });
    trackEvent('pwa_install');

    expect(eventsFrom(gtagMock)).toEqual([]);
  });

  it('sends nothing after consent is denied', () => {
    setStoredConsent('denied');
    gtagMock.mockClear();
    expect(isAnalyticsAllowed()).toBe(false);

    trackPageView('/dashboard', 'Dashboard');
    trackEvent('deck_create', { is_public: false });

    expect(eventsFrom(gtagMock)).toEqual([]);
  });

  it('sends events only once consent is granted', () => {
    trackEvent('deck_create', { is_public: true });
    expect(eventsFrom(gtagMock)).toEqual([]);

    setStoredConsent('granted');
    trackEvent('deck_create', { is_public: true });

    expect(eventsFrom(gtagMock)).toEqual([['deck_create', { is_public: true }]]);
  });

  it('sends an empty parameter object for events that declare none', () => {
    setStoredConsent('granted');
    trackEvent('pwa_install');

    expect(eventsFrom(gtagMock)).toEqual([['pwa_install', {}]]);
  });
});

describe('Telemetry page paths', () => {
  const gtagMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    gtagMock.mockClear();
    window.gtag = gtagMock;
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('DEV', false);
    setStoredConsent('granted');
    gtagMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('replaces the headword and deck id with placeholders', () => {
    expect(redactPagePath('/word/Haus')).toBe('/word/:word');
    expect(redactPagePath('/word/Bundesausbildungsf%C3%B6rderungsgesetz')).toBe('/word/:word');
    expect(redactPagePath('/decks/clx0000000000000000000')).toBe('/decks/:id');
  });

  it('leaves paths that carry no user data alone', () => {
    expect(redactPagePath('/')).toBe('/');
    expect(redactPagePath('/dictionary')).toBe('/dictionary');
    // A course slug names public catalogue content, not the learner.
    expect(redactPagePath('/courses/a1-grundwortschatz')).toBe('/courses/a1-grundwortschatz');
  });

  it('never reports the word being studied, in the path or the location', () => {
    trackPageView('/word/Haus', 'Vocabahn');

    const setCall = gtagMock.mock.calls.find((call) => call[0] === 'set');
    expect(setCall?.[1]).toEqual({
      page_path: '/word/:word',
      page_location: 'https://vocabahn.app/word/:word',
      page_title: 'Vocabahn',
    });
    expect(eventsFrom(gtagMock)).toEqual([
      [
        'page_view',
        {
          page_path: '/word/:word',
          page_location: 'https://vocabahn.app/word/:word',
          page_title: 'Vocabahn',
        },
      ],
    ]);
    expect(JSON.stringify(gtagMock.mock.calls)).not.toContain('Haus');
  });
});

/**
 * The taxonomy is enforced by the compiler, so these assertions are checked by
 * `tsc --noEmit` rather than at runtime: each `@ts-expect-error` fails the
 * typecheck if the line it guards ever stops being an error.
 */
describe('Analytics event taxonomy', () => {
  it('rejects unknown names and wrong parameter shapes at compile time', () => {
    // @ts-expect-error — not an event in the taxonomy.
    expect(() => trackEvent('totally_made_up_event', {})).not.toThrow();

    // @ts-expect-error — `custom_word_added` takes source/word_count, and this
    // is the shape that used to be sent from the dictionary entry page.
    expect(() => trackEvent('custom_word_added', { word: 'Haus', deck_id: 'd1' })).not.toThrow();

    // @ts-expect-error — and this is the shape the deck import used to send.
    expect(() => trackEvent('custom_word_added', { deck_id: 'd1', count: 4 })).not.toThrow();

    // @ts-expect-error — `word_count` must be a number.
    expect(() => trackEvent('custom_word_added', { source: 'entry_page', word_count: '1' })).not.toThrow();

    // @ts-expect-error — `source` must be one of the two known call sites.
    expect(() => trackEvent('custom_word_added', { source: 'somewhere_else', word_count: 1 })).not.toThrow();

    // @ts-expect-error — required parameters cannot be omitted.
    expect(() => trackEvent('deck_create')).not.toThrow();

    // Both real call sites now agree, and both typecheck.
    expect(() => trackEvent('custom_word_added', { source: 'entry_page', word_count: 1 })).not.toThrow();
    expect(() => trackEvent('custom_word_added', { source: 'deck_import', word_count: 12 })).not.toThrow();
  });
});
