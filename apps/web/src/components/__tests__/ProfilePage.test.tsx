import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from '../ProfilePage';
import { renderWithProviders } from '../../test/test-utils';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    fetchMe: vi.fn(),
    fetchEnrichmentQuota: vi.fn().mockResolvedValue({ used: 2, cap: 20 }),
    logout: vi.fn(),
    requestEmailSignIn: vi.fn(),
    updateInterests: vi.fn(),
    // The reminder section is server-backed; without this it would leave a
    // rejected query in every test on this page.
    fetchNotificationSettings: vi.fn().mockResolvedValue({
      reminderEnabled: false,
      reminderTime: '19:00',
      timezone: 'Europe/Berlin',
      pushConfigured: false,
      vapidPublicKey: null,
      deviceCount: 0,
    }),
  };
});

const { fetchMe } = await import('../../api');

const USER = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
  avatarUrl: null,
  cefrLevel: 'B1.1' as const,
  interests: [],
};

describe('ProfilePage preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchMe).mockResolvedValue(USER);
  });

  it('confirms the autoplay toggle with a toast naming the new state', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    const toggle = await screen.findByRole('checkbox', { name: /Autoplay audio during reviews/ });

    await user.click(toggle);
    expect(screen.getByRole('status')).toHaveTextContent('Autoplay audio on');

    await user.click(toggle);
    expect(screen.getByRole('status')).toHaveTextContent('Autoplay audio off');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('has no accessibility violations while a toast is showing', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<ProfilePage />);

    const toggle = await screen.findByRole('checkbox', { name: /Autoplay audio during reviews/ });
    await user.click(toggle);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));

    expect(await axe(container)).toHaveNoViolations();
  });
});
