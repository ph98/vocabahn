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

const { fetchMe, updateInterests, logout } = await import('../../api');

const USER = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
  avatarUrl: null,
  cefrLevel: 'B1.1' as const,
  interests: [],
};

describe('ProfilePage preferences and feedback', () => {
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

  it('shows a toast confirming when reading interests are toggled and saved', async () => {
    const user = userEvent.setup();
    vi.mocked(updateInterests).mockResolvedValue({
      ...USER,
      interests: ['news'],
    });

    renderWithProviders(<ProfilePage />);

    const topicButton = await screen.findByRole('button', { name: /News/i });
    await user.click(topicButton);

    await waitFor(() => expect(updateInterests).toHaveBeenCalledWith(['news']));
    expect(await screen.findByText('Reading interests saved (1 subject)')).toBeInTheDocument();
  });

  it('shows an error toast if saving reading interests fails', async () => {
    const user = userEvent.setup();
    vi.mocked(updateInterests).mockRejectedValue(new Error('Network error'));

    renderWithProviders(<ProfilePage />);

    const topicButton = await screen.findByRole('button', { name: /News/i });
    await user.click(topicButton);

    await waitFor(() => expect(updateInterests).toHaveBeenCalledWith(['news']));
    expect(await screen.findByText("Couldn't save reading interests")).toBeInTheDocument();
  });

  it('shows an info toast when downloading the offline dictionary pack', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    const downloadLink = await screen.findByRole('link', { name: /Download/i });
    await user.click(downloadLink);

    expect(await screen.findByText(/Downloading offline dictionary pack/)).toBeInTheDocument();
  });

  it('shows an info toast when sign out is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(logout).mockResolvedValue(undefined as never);

    renderWithProviders(<ProfilePage />);

    const signOutBtn = await screen.findByRole('button', { name: /Sign out/i });
    await user.click(signOutBtn);

    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(await screen.findByText('Signed out')).toBeInTheDocument();
  });

  it('allows adding custom specific topics and confirms with toast', async () => {
    const user = userEvent.setup();
    vi.mocked(updateInterests).mockResolvedValue({
      ...USER,
      interests: ['Formula 1'],
    });

    renderWithProviders(<ProfilePage />);

    const input = await screen.findByPlaceholderText(/Add specific topic/i);
    await user.type(input, 'Formula 1');

    const addBtn = screen.getByRole('button', { name: /^Add$/i });
    await user.click(addBtn);

    await waitFor(() => expect(updateInterests).toHaveBeenCalledWith(['Formula 1']));
    expect(await screen.findByText('Reading interests saved (1 subject)')).toBeInTheDocument();
  });

  it('filters topics by search query in real time', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    const searchInput = await screen.findByPlaceholderText(/Search topics/i);
    await user.type(searchInput, 'Astronomy');

    expect(screen.getByRole('button', { name: /Space & Astronomy/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^News$/i })).not.toBeInTheDocument();

    const clearSearchBtn = screen.getByRole('button', { name: /Clear topic search/i });
    await user.click(clearSearchBtn);

    expect(screen.getByRole('button', { name: /^News$/i })).toBeInTheDocument();
  });

  it('filters topics by category tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    const sportsTab = await screen.findByRole('tab', { name: /Sports & Fitness/i });
    await user.click(sportsTab);

    expect(screen.getByRole('button', { name: /Football/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^News$/i })).not.toBeInTheDocument();
  });

  it('allows removing a custom topic and clearing all interests', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMe).mockResolvedValue({
      ...USER,
      interests: ['news', 'Cyberpunk'],
    });

    renderWithProviders(<ProfilePage />);

    const removeBtn = await screen.findByRole('button', { name: /Remove topic Cyberpunk/i });
    vi.mocked(updateInterests).mockResolvedValueOnce({
      ...USER,
      interests: ['news'],
    });

    await user.click(removeBtn);
    await waitFor(() => expect(updateInterests).toHaveBeenCalledWith(['news']));

    const clearAllBtn = screen.getByRole('button', { name: /Clear all/i });
    vi.mocked(updateInterests).mockResolvedValueOnce({
      ...USER,
      interests: [],
    });

    await user.click(clearAllBtn);
    await waitFor(() => expect(updateInterests).toHaveBeenCalledWith([]));
    expect(await screen.findByText('Reading interests cleared')).toBeInTheDocument();
  });

  it('switches between tabs and updates active aria-selected states', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    const overviewTab = await screen.findByRole('tab', { name: /Proficiency & Quota/i });
    const interestsTab = await screen.findByRole('tab', { name: /Reading Interests/i });
    const preferencesTab = await screen.findByRole('tab', { name: /Preferences & Sync/i });

    expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    expect(interestsTab).toHaveAttribute('aria-selected', 'false');
    expect(preferencesTab).toHaveAttribute('aria-selected', 'false');

    // Switch to Reading Interests tab
    await user.click(interestsTab);
    expect(interestsTab).toHaveAttribute('aria-selected', 'true');
    expect(overviewTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('heading', { name: /Curate Reading Interests/i })).toBeInTheDocument();

    // Switch to Preferences & Sync tab
    await user.click(preferencesTab);
    expect(preferencesTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: /Review Audio & Study/i })).toBeInTheDocument();
  });

  it('supports roving tabindex keyboard navigation across profile tabs', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    const overviewTab = await screen.findByRole('tab', { name: /Proficiency & Quota/i });
    const interestsTab = await screen.findByRole('tab', { name: /Reading Interests/i });

    overviewTab.focus();
    expect(overviewTab).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(interestsTab).toHaveFocus();
    expect(interestsTab).toHaveAttribute('aria-selected', 'true');
  });

  it('toggles the CEFR calibration drawer in the Overview tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    const calibrateBtn = await screen.findByRole('button', { name: /Re-calibrate Level/i });
    await user.click(calibrateBtn);

    expect(await screen.findByRole('heading', { name: /Re-calibrate Your German Level/i })).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /Close Calibration/i });
    await user.click(closeBtn);

    expect(screen.queryByRole('heading', { name: /Re-calibrate Your German Level/i })).not.toBeInTheDocument();
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

