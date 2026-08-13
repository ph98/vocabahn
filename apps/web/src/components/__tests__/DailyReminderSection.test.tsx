import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationSettings } from '@vocabahn/shared';
import { DailyReminderSection } from '../DailyReminderSection';
import { renderWithProviders } from '../../test/test-utils';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    fetchNotificationSettings: vi.fn(),
    updateNotificationSettings: vi.fn(),
    registerPushSubscription: vi.fn(),
    removePushSubscription: vi.fn(),
  };
});

vi.mock('../../lib/push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/push')>();
  return {
    ...actual,
    describePushSupport: vi.fn(() => ({ supported: true, reason: null })),
    currentPermission: vi.fn(() => 'default'),
    subscribeToPush: vi.fn(),
    unsubscribeFromPush: vi.fn(),
  };
});

vi.mock('../../lib/telemetry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/telemetry')>();
  return { ...actual, trackEvent: vi.fn() };
});

const {
  fetchNotificationSettings,
  updateNotificationSettings,
  registerPushSubscription,
  removePushSubscription,
} = await import('../../api');
const { describePushSupport, currentPermission, subscribeToPush, unsubscribeFromPush } =
  await import('../../lib/push');
const { trackEvent } = await import('../../lib/telemetry');

const SETTINGS: NotificationSettings = {
  reminderEnabled: false,
  reminderTime: '19:00',
  timezone: 'Europe/Berlin',
  pushConfigured: true,
  vapidPublicKey: 'BPublicKey',
  deviceCount: 0,
};

const SUBSCRIPTION = {
  endpoint: 'https://push.example/abc',
  keys: { p256dh: 'key', auth: 'secret' },
};

function givenSettings(overrides: Partial<NotificationSettings> = {}) {
  vi.mocked(fetchNotificationSettings).mockResolvedValue({ ...SETTINGS, ...overrides });
}

describe('DailyReminderSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(describePushSupport).mockReturnValue({ supported: true, reason: null });
    vi.mocked(currentPermission).mockReturnValue('default');
    vi.mocked(subscribeToPush).mockResolvedValue(SUBSCRIPTION);
    vi.mocked(unsubscribeFromPush).mockResolvedValue(SUBSCRIPTION.endpoint);
    vi.mocked(registerPushSubscription).mockResolvedValue(SETTINGS);
    vi.mocked(removePushSubscription).mockResolvedValue(SETTINGS);
    givenSettings();
  });

  it('never asks for permission on render — the prompt is one-shot per origin', async () => {
    renderWithProviders(<DailyReminderSection />);
    await screen.findByRole('button', { name: /Remind me daily/ });
    expect(subscribeToPush).not.toHaveBeenCalled();
  });

  it('subscribes, then turns the preference on, when the learner asks', async () => {
    const user = userEvent.setup();
    vi.mocked(updateNotificationSettings).mockResolvedValue({
      ...SETTINGS,
      reminderEnabled: true,
      deviceCount: 1,
    });

    renderWithProviders(<DailyReminderSection />);
    await user.click(await screen.findByRole('button', { name: /Remind me daily/ }));

    await waitFor(() => expect(registerPushSubscription).toHaveBeenCalledWith(SUBSCRIPTION));
    expect(updateNotificationSettings).toHaveBeenCalledWith({ reminderEnabled: true });
    expect(trackEvent).toHaveBeenCalledWith('notification_opt_in', { permission: 'granted' });
    expect(await screen.findByText(/Daily reminder on/)).toBeInTheDocument();
  });

  it('turning it off deletes the subscription server-side, not just the UI', async () => {
    const user = userEvent.setup();
    givenSettings({ reminderEnabled: true, deviceCount: 1 });
    vi.mocked(updateNotificationSettings).mockResolvedValue({ ...SETTINGS, deviceCount: 0 });

    renderWithProviders(<DailyReminderSection />);
    await user.click(await screen.findByRole('button', { name: /Turn off/ }));

    await waitFor(() =>
      expect(removePushSubscription).toHaveBeenCalledWith(SUBSCRIPTION.endpoint),
    );
    expect(updateNotificationSettings).toHaveBeenCalledWith({ reminderEnabled: false });
    expect(trackEvent).toHaveBeenCalledWith('notification_opt_out');
  });

  it('saves a new reminder time when the picker is left', async () => {
    const user = userEvent.setup();
    givenSettings({ reminderEnabled: true, deviceCount: 1 });
    vi.mocked(updateNotificationSettings).mockResolvedValue({
      ...SETTINGS,
      reminderEnabled: true,
      reminderTime: '07:30',
    });

    renderWithProviders(<DailyReminderSection />);
    const input = await screen.findByLabelText(/Remind me at/);
    await user.clear(input);
    await user.type(input, '07:30');
    await user.tab();

    await waitFor(() =>
      expect(updateNotificationSettings).toHaveBeenCalledWith({ reminderTime: '07:30' }),
    );
  });

  it('explains a denied permission instead of showing a toggle that does nothing', async () => {
    vi.mocked(currentPermission).mockReturnValue('denied');
    renderWithProviders(<DailyReminderSection />);

    expect(await screen.findByText(/blocked for this site/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remind me daily/ })).not.toBeInTheDocument();
  });

  it('explains the Add-to-Home-Screen requirement on iOS Safari', async () => {
    vi.mocked(describePushSupport).mockReturnValue({
      supported: false,
      reason: 'ios-needs-install',
    });
    renderWithProviders(<DailyReminderSection />);

    expect(await screen.findByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remind me daily/ })).not.toBeInTheDocument();
  });

  it('says reminders are unavailable when the server has no VAPID keys', async () => {
    givenSettings({ pushConfigured: false, vapidPublicKey: null });
    renderWithProviders(<DailyReminderSection />);

    expect(await screen.findByText(/aren't set up on this server/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remind me daily/ })).not.toBeInTheDocument();
  });

  it('says so when the browser has no Push API at all', async () => {
    vi.mocked(describePushSupport).mockReturnValue({ supported: false, reason: 'no-push-manager' });
    renderWithProviders(<DailyReminderSection />);

    expect(await screen.findByText(/can't receive push notifications/)).toBeInTheDocument();
  });

  it('reports a dismissed permission prompt honestly and leaves the setting off', async () => {
    const user = userEvent.setup();
    const { PushPermissionDeniedError } = await import('../../lib/push');
    vi.mocked(subscribeToPush).mockRejectedValue(new PushPermissionDeniedError());

    renderWithProviders(<DailyReminderSection />);
    await user.click(await screen.findByRole('button', { name: /Remind me daily/ }));

    expect(await screen.findByText(/didn't allow notifications/)).toBeInTheDocument();
    expect(updateNotificationSettings).not.toHaveBeenCalled();
    // The taxonomy (#75) models this as one event carrying the prompt's
    // outcome, so a refusal is reported as `denied` rather than not reported —
    // otherwise the granted rate has no denominator.
    expect(trackEvent).toHaveBeenCalledWith('notification_opt_in', { permission: 'denied' });
  });

  it('has no accessibility violations', async () => {
    givenSettings({ reminderEnabled: true, deviceCount: 2 });
    const { container } = renderWithProviders(<DailyReminderSection />);
    await screen.findByRole('button', { name: /Turn off/ });

    expect(await axe(container)).toHaveNoViolations();
  });
});
