import { fireEvent, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { renderWithProviders } from '../../test/test-utils';

/** Key behind `lib/session-hint.ts`. Named here so a rename cannot pass silently. */
const SESSION_HINT_KEY = 'vocabahn-session-hint';

// The hint outlives a render, so a signed-in case would otherwise change what
// the next test's loading state looks like.
beforeEach(() => localStorage.removeItem(SESSION_HINT_KEY));

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

const { ApiUnavailableError, fetchMe, fetchHealth } = await import('../../api');

const SIGNED_IN_USER = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
  avatarUrl: null,
  cefrLevel: null,
  interests: [],
};

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

/**
 * The auth gate has three answers, not two. Only the first of these means the
 * user is signed out; the other two used to, which is what dropped signed-in
 * people on the marketing page whenever the API blipped.
 */
describe('App auth gate', () => {
  it('signs the user out when the API confirms a 401', async () => {
    // `fetchMe` resolves null only for a 401 the silent refresh could not rescue.
    vi.mocked(fetchMe).mockResolvedValue(null);

    renderWithProviders(<App />);

    await waitFor(() => expect(screen.getByText('Sign in with Google')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: /reach Vocabahn right now/i })).not.toBeInTheDocument();
  });

  it('shows an unavailable state, not the landing page, when the API never answers', async () => {
    vi.mocked(fetchMe).mockRejectedValue(new ApiUnavailableError('The API did not answer the session request.'));

    const { container } = renderWithProviders(<App />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /reach Vocabahn right now/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText('Sign in with Google')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    // Nothing here suggests the session is gone, because it isn't.
    expect(screen.getByText(/your account and your progress are safe/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows an unavailable state on a 5xx', async () => {
    vi.mocked(fetchMe).mockRejectedValue(
      new ApiUnavailableError('The API answered the session request with 503.', { status: 503 }),
    );

    renderWithProviders(<App />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /reach Vocabahn right now/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText('Sign in with Google')).not.toBeInTheDocument();
  });

  it('backs off instead of hammering the API it cannot reach', async () => {
    vi.mocked(fetchMe).mockReset();
    vi.mocked(fetchMe).mockRejectedValue(new ApiUnavailableError('The API did not answer the session request.'));

    renderWithProviders(<App />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /reach Vocabahn right now/i })).toBeInTheDocument(),
    );
    // Long enough that a per-render retry loop would show up in the thousands.
    await new Promise((resolve) => setTimeout(resolve, 600));
    // The first check, plus at most the one the health poll asks for.
    expect(vi.mocked(fetchMe).mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('offers a manual retry that checks again', async () => {
    vi.mocked(fetchMe).mockReset();
    vi.mocked(fetchMe).mockRejectedValue(new ApiUnavailableError('The API did not answer the session request.'));

    renderWithProviders(<App />);

    const retry = await screen.findByRole('button', { name: 'Try again now' });
    // It disables itself while a check is already in flight, so wait it out.
    await waitFor(() => expect(retry).not.toBeDisabled());
    const before = vi.mocked(fetchMe).mock.calls.length;
    fireEvent.click(retry);

    await waitFor(() => expect(vi.mocked(fetchMe).mock.calls.length).toBeGreaterThan(before));
  });

  it('shows the landing page while the first check is still in flight, on a device that has never held a session', async () => {
    // Never resolves: the assertion is about what is on screen *before* the API
    // says anything, which is where the second of LCP used to go.
    vi.mocked(fetchMe).mockReset();
    vi.mocked(fetchMe).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<App />);

    await waitFor(() => expect(screen.getByText('Sign in with Google')).toBeInTheDocument());
    // Rendering it is not the same as believing the visitor is signed out: no
    // route is mounted and the One Tap prompt has not been asked for.
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('waits for the answer instead of flashing the landing page at a returning user', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');
    vi.mocked(fetchMe).mockReset();
    let resolveMe: (user: typeof SIGNED_IN_USER) => void = () => {};
    vi.mocked(fetchMe).mockReturnValue(new Promise((resolve) => { resolveMe = resolve; }));

    renderWithProviders(<App />);

    // The marketing page must never appear over a session that may still be
    // valid — the whole point of the anonymous/unreachable distinction.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText('Sign in with Google')).not.toBeInTheDocument();

    resolveMe(SIGNED_IN_USER);
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument());
  });

  it('remembers a confirmed session and forgets a confirmed sign-out', async () => {
    vi.mocked(fetchMe).mockReset();
    vi.mocked(fetchMe).mockResolvedValue(SIGNED_IN_USER);
    const signedIn = renderWithProviders(<App />);
    await waitFor(() => expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1'));
    signedIn.unmount();

    vi.mocked(fetchMe).mockResolvedValue(null);
    renderWithProviders(<App />);
    await waitFor(() => expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull());
  });

  it('does not forget the session because the API had an outage', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');
    vi.mocked(fetchMe).mockReset();
    vi.mocked(fetchMe).mockRejectedValue(new ApiUnavailableError('The API did not answer the session request.'));

    renderWithProviders(<App />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /reach Vocabahn right now/i })).toBeInTheDocument(),
    );
    // A failure is evidence about the API, not about the session. Clearing the
    // marker here would greet the next load with the landing page.
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
  });

  it('comes back on the same route, without signing in again, once /health answers', async () => {
    vi.mocked(fetchMe)
      .mockRejectedValueOnce(new ApiUnavailableError('The API did not answer the session request.'))
      .mockResolvedValue(SIGNED_IN_USER);

    renderWithProviders(<App />, { route: '/terms' });

    // The footer's health poll is the only thing that recovers the session.
    await waitFor(() => expect(vi.mocked(fetchHealth)).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument(),
    );
    // `findBy`, not `getBy`: the nav is a lazy chunk of its own, so it arrives a
    // tick after the route it sits above.
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});
