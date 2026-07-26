import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStoredConsent, setStoredConsent, trackEvent, trackPageView } from '../../lib/telemetry';

describe('Telemetry & GDPR Consent', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.gtag;
    delete window.dataLayer;
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

  it('does not send trackEvent or trackPageView when consent is pending or denied', () => {
    const gtagMock = vi.fn();
    window.gtag = gtagMock;

    setStoredConsent('denied');
    trackEvent('login', { method: 'google' });
    trackPageView('/dashboard', 'Dashboard');

    expect(gtagMock).not.toHaveBeenCalledWith('event', 'login', { method: 'google' });
    expect(gtagMock).not.toHaveBeenCalledWith('event', 'page_view', { page_path: '/dashboard', page_title: 'Dashboard' });
  });
});
