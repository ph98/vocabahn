import { fireEvent, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { renderWithProviders } from '../../test/test-utils';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    fetchMe: vi.fn(),
    fetchHealth: vi.fn().mockResolvedValue({ status: 'ok', services: { database: 'up', redis: 'up' } }),
    searchDictionary: vi.fn().mockResolvedValue([]),
    logout: vi.fn(),
    googleOneTapLogin: vi.fn(),
  };
});

const { fetchMe } = await import('../../api');

describe('App', () => {
  afterEach(() => {
    localStorage.removeItem('vocabahn-theme');
    document.documentElement.classList.remove('theme-light', 'theme-dark');
  });
  it('renders the sign-in screen with no accessibility violations when signed out', async () => {
    vi.mocked(fetchMe).mockResolvedValue(null);
    const { container } = renderWithProviders(<App />);

    await waitFor(() => expect(screen.getByText('Sign in with Google')).toBeInTheDocument());

    expect(await axe(container)).toHaveNoViolations();
  });

  it('links the repository from the footer, distinct from the version/changelog link', async () => {
    vi.mocked(fetchMe).mockResolvedValue(null);
    renderWithProviders(<App />);

    await waitFor(() => expect(screen.getByText('Sign in with Google')).toBeInTheDocument());

    // Accessible name comes from the visible label, so the inlined mark stays aria-hidden.
    const repoLink = screen.getByRole('link', { name: 'Source on GitHub' });
    expect(repoLink).toHaveAttribute('href', 'https://github.com/ph98/vocabahn');
    expect(repoLink).toHaveAttribute('target', '_blank');
    expect(repoLink).toHaveAttribute('rel', 'noopener noreferrer');

    // The version link still points at the changelog, i.e. this is a second link.
    const versionLink = screen.getByRole('link', { name: /^v\d/ });
    expect(versionLink).toHaveAttribute(
      'href',
      'https://github.com/ph98/vocabahn/blob/main/docs/changelog.md',
    );
    expect(versionLink).not.toBe(repoLink);

    // The licence is PolyForm Noncommercial, so no "open source" claim may appear.
    expect(screen.queryByText(/open source/i)).not.toBeInTheDocument();
  });

  it('renders the main nav and dictionary search when signed in, with no accessibility violations', async () => {
    vi.mocked(fetchMe).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      avatarUrl: null,
      cefrLevel: null,
      interests: [],
    });
    const { container } = renderWithProviders(<App />);

    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });


  it('toggles theme on Ctrl+Shift+L in development mode', async () => {
    const originalDev = import.meta.env.DEV;
    import.meta.env.DEV = true;

    vi.mocked(fetchMe).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      avatarUrl: null,
      cefrLevel: null,
      interests: [],
    });
    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument());

    expect(localStorage.getItem('vocabahn-theme')).toBeNull();

    // Trigger Ctrl+Shift+L
    fireEvent.keyDown(window, { ctrlKey: true, shiftKey: true, key: 'l' });
    expect(localStorage.getItem('vocabahn-theme')).toBe('dark');
    expect(document.documentElement.classList).toContain('theme-dark');

    // Trigger Ctrl+Shift+L again
    fireEvent.keyDown(window, { ctrlKey: true, shiftKey: true, key: 'l' });
    expect(localStorage.getItem('vocabahn-theme')).toBe('light');
    expect(document.documentElement.classList).toContain('theme-light');

    import.meta.env.DEV = originalDev;
  });

  it('does not toggle theme on Ctrl+Shift+L in production mode', async () => {
    const originalDev = import.meta.env.DEV;
    import.meta.env.DEV = false;

    vi.mocked(fetchMe).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      avatarUrl: null,
      cefrLevel: null,
      interests: [],
    });
    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument());

    expect(localStorage.getItem('vocabahn-theme')).toBeNull();

    // Trigger Ctrl+Shift+L
    fireEvent.keyDown(window, { ctrlKey: true, shiftKey: true, key: 'l' });
    expect(localStorage.getItem('vocabahn-theme')).toBeNull();

    import.meta.env.DEV = originalDev;
  });
});
