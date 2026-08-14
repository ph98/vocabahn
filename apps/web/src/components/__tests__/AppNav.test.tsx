import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppNav } from '../AppNav';
import { renderWithProviders } from '../../test/test-utils';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    fetchMe: vi.fn(),
    logout: vi.fn(),
  };
});

const { fetchMe, logout } = await import('../../api');

const MOCK_USER = {
  id: 'user-1',
  email: 'learner@example.com',
  name: 'Parham Learner',
  avatarUrl: null,
  cefrLevel: 'B1.1' as const,
  interests: ['technology', 'news'],
};

describe('AppNav header and accessible menu', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchMe).mockResolvedValue(MOCK_USER);
  });

  it('renders the header brand logo and primary nav links', async () => {
    const { container } = renderWithProviders(<AppNav />);

    const brandLink = screen.getByRole('link', { name: 'Vocabahn Home' });
    expect(brandLink).toBeInTheDocument();
    expect(brandLink).toHaveAttribute('href', '/');

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /dictionary/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /library/i })).toBeInTheDocument();

    const profileButton = screen.getByRole('button', { name: /profile/i });
    expect(profileButton).toBeInTheDocument();
    expect(profileButton).toHaveAttribute('aria-haspopup', 'menu');
    expect(profileButton).toHaveAttribute('aria-expanded', 'false');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('opens accessible profile menu with user summary and descriptive options', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<AppNav />);

    const profileButton = screen.getByRole('button', { name: /profile/i });
    await user.click(profileButton);

    expect(profileButton).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: /profile/i });
    expect(menu).toBeInTheDocument();

    // User header preview
    expect(screen.getByText('Parham Learner')).toBeInTheDocument();
    expect(screen.getByText('learner@example.com')).toBeInTheDocument();
    expect(screen.getByText('B1.1')).toBeInTheDocument();

    // Learning tools section with detailed descriptions
    expect(screen.getByText('Micro-Stories')).toBeInTheDocument();
    expect(screen.getByText('AI-generated reading practice with real news')).toBeInTheDocument();
    expect(screen.getByText('Known Words')).toBeInTheDocument();
    expect(screen.getByText('Vocabulary inventory & CEFR progression')).toBeInTheDocument();

    // Account & Preferences section with detailed descriptions
    expect(screen.getByText('Profile & Settings')).toBeInTheDocument();
    expect(screen.getByText('CEFR level, topics, reminders & account')).toBeInTheDocument();
    expect(screen.getByText('Help & User Guide')).toBeInTheDocument();
    expect(screen.getByText('Shortcuts, FAQs & spaced repetition guide')).toBeInTheDocument();

    // Theme selector
    expect(screen.getByRole('menuitemradio', { name: /switch to light theme/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /switch to dark theme/i })).toBeInTheDocument();

    // Sign out button
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('toggles theme between System, Light, and Dark from the menu', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppNav />);

    const profileButton = screen.getByRole('button', { name: /profile/i });
    await user.click(profileButton);

    const lightBtn = screen.getByRole('menuitemradio', { name: /switch to light theme/i });
    await user.click(lightBtn);
    expect(localStorage.getItem('vocabahn-theme')).toBe('light');

    const darkBtn = screen.getByRole('menuitemradio', { name: /switch to dark theme/i });
    await user.click(darkBtn);
    expect(localStorage.getItem('vocabahn-theme')).toBe('dark');
  });

  it('closes menu and restores focus on Escape key', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppNav />);

    const profileButton = screen.getByRole('button', { name: /profile/i });
    profileButton.focus();
    await user.click(profileButton);

    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(profileButton).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(profileButton);
  });

  it('navigates menu items with ArrowDown and ArrowUp keys', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppNav />);

    const profileButton = screen.getByRole('button', { name: /profile/i });
    await user.click(profileButton);

    const menu = screen.getByRole('menu');
    const menuItems = Array.from(menu.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
    expect(menuItems.length).toBeGreaterThan(3);

    // Initial focus on first item
    const firstItem = menuItems[0];
    const secondItem = menuItems[1];
    expect(firstItem).toBeDefined();
    expect(secondItem).toBeDefined();

    firstItem?.focus();
    expect(document.activeElement).toBe(firstItem);

    // Press ArrowDown to move to next item
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(secondItem);

    // Press ArrowUp to move back
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(firstItem);
  });

  it('triggers logout when sign out button is clicked', async () => {
    vi.mocked(logout).mockResolvedValue(undefined as never);
    const user = userEvent.setup();
    renderWithProviders(<AppNav />);

    const profileButton = screen.getByRole('button', { name: /profile/i });
    await user.click(profileButton);

    const signOutBtn = screen.getByRole('menuitem', { name: /sign out/i });
    await user.click(signOutBtn);

    await waitFor(() => expect(logout).toHaveBeenCalled());
  });
});
