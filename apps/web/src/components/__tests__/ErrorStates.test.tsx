import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { axe } from 'jest-axe';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppErrorBoundary,
  ErrorBoundary,
  ErrorStateForError,
  ForbiddenState,
  ResourceNotFoundState,
  RouteNotFoundState,
  ServerErrorState,
  ServerUnreachableState,
  classifyError,
  isStaleChunkError,
} from '../errors';

vi.mock('../../lib/app-update', () => ({ reloadToLatestVersion: vi.fn() }));

const { reloadToLatestVersion } = await import('../../lib/app-update');

const TEST_USER = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
  avatarUrl: null,
  cefrLevel: null,
  interests: [],
};

/** Renders with a router and a query client whose `['me']` entry is pre-seeded, never fetched. */
function renderError(ui: ReactElement, { user }: { user?: unknown } = {}): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (user !== undefined) queryClient.setQueryData(['me'], user);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function Boom({ error }: { error: unknown }): never {
  throw error;
}

describe('classifyError', () => {
  it('maps HTTP statuses to their designed state', () => {
    expect(classifyError({ status: 403 })).toBe('forbidden');
    expect(classifyError({ status: 404 })).toBe('not-found');
    expect(classifyError({ status: 500 })).toBe('server');
    expect(classifyError({ status: 503 })).toBe('server');
  });

  it('treats an axios request that never got a response as unreachable', () => {
    expect(classifyError(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe('unreachable');
  });

  it('recognises a dynamic import that failed because the chunk is gone', () => {
    const chromium = new Error(
      'Failed to fetch dynamically imported module: https://vocabahn.app/assets/DashboardPage-a1b2c3.js',
    );
    const firefox = new Error('error loading dynamically imported module');
    const safari = new Error('Importing a module script failed.');

    for (const error of [chromium, firefox, safari]) {
      expect(isStaleChunkError(error)).toBe(true);
      expect(classifyError(error)).toBe('stale-chunk');
    }

    expect(isStaleChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('falls back to the unexpected-error state for anything else', () => {
    expect(classifyError(new TypeError('x is not a function'))).toBe('unknown');
  });
});

describe('the error boundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs every error it catches; the throws below are deliberate.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    vi.mocked(reloadToLatestVersion).mockClear();
  });

  it('renders the 500 page instead of a white screen when a child throws', async () => {
    const { container } = renderError(
      <ErrorBoundary>
        <Boom error={new TypeError('render exploded')} />
      </ErrorBoundary>,
      { user: TEST_USER },
    );

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Something went wrong on our end');
    // Focus lands on the heading so a screen-reader user is told what happened.
    expect(heading).toHaveFocus();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to your dashboard/i })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('recovers when the caught error is cleared by retrying', async () => {
    let shouldThrow = true;

    function Flaky() {
      if (shouldThrow) throw new TypeError('render exploded');
      return <p>recovered</p>;
    }

    renderError(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Something went wrong on our end');

    shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('clears a caught error when the reset key changes, so navigating away recovers', () => {
    function Flaky({ boom }: { boom: boolean }) {
      if (boom) throw new TypeError('render exploded');
      return <p>the next page</p>;
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (boom: boolean, key: string) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ErrorBoundary resetKey={key}>
            <Flaky boom={boom} />
          </ErrorBoundary>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const { rerender } = render(tree(true, '/broken'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Something went wrong on our end');

    rerender(tree(false, '/somewhere-else'));
    expect(screen.getByText('the next page')).toBeInTheDocument();
  });

  it('offers a reload for a stale chunk after a redeploy, not a generic error', async () => {
    renderError(
      <ErrorBoundary>
        <Boom
          error={
            new Error(
              'Failed to fetch dynamically imported module: https://vocabahn.app/assets/DashboardPage-a1b2c3.js',
            )
          }
        />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'A new version of Vocabahn is ready',
    );
    expect(screen.queryByText(/something went wrong on our end/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /reload to get the latest version/i }));
    expect(reloadToLatestVersion).toHaveBeenCalledTimes(1);
  });

  it('renders for a signed-out visitor, with a way out and no app nav', async () => {
    const { container } = renderError(
      <AppErrorBoundary>
        <Boom error={new TypeError('render exploded')} />
      </AppErrorBoundary>,
      { user: null },
    );

    expect(screen.getByRole('link', { name: /go to the home page/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('the route 404 page', () => {
  it('sends a signed-out visitor to the home page, not to a dashboard they cannot see', () => {
    renderError(<RouteNotFoundState />, { user: null });

    expect(screen.getByRole('link', { name: /go to the home page/i })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
  });

  it('sends a signed-in learner to the dashboard and offers the dictionary', () => {
    renderError(<RouteNotFoundState />, { user: TEST_USER });

    expect(screen.getByRole('link', { name: /go to your dashboard/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /search the dictionary/i })).toHaveAttribute(
      'href',
      '/dictionary',
    );
  });

  it('has an h1, takes focus, animates nothing unconditionally, and passes axe', async () => {
    const { container } = renderError(<RouteNotFoundState />, { user: null });

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent("This page doesn't exist");
    expect(heading).toHaveFocus();
    // The old page pulsed its icon regardless of prefers-reduced-motion.
    expect(container.querySelector('.animate-pulse')).toBeNull();
    expect(container.querySelector('.animate-spin')).toBeNull();

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('the server-unreachable state', () => {
  it('says it is retrying on its own and still offers a manual retry', async () => {
    const onRetry = vi.fn();
    renderError(<ServerUnreachableState retryInSeconds={4} onRetry={onRetry} />, { user: null });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      "We can't reach Vocabahn right now",
    );
    expect(screen.getByRole('status')).toHaveTextContent(/checking again automatically/i);
    expect(screen.getByRole('status')).toHaveTextContent(/next check in 4s/i);
    expect(screen.getByRole('link', { name: /system status/i })).toHaveAttribute('href', '/status');

    await userEvent.click(screen.getByRole('button', { name: /try again now/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('disables the manual retry while a check is already in flight', () => {
    renderError(<ServerUnreachableState isRetrying onRetry={vi.fn()} />, { user: null });

    expect(screen.getByRole('status')).toHaveTextContent(/checking now/i);
    expect(screen.getByRole('button', { name: /try again now/i })).toBeDisabled();
  });

  it('does not promise an automatic retry when nothing is polling', () => {
    renderError(<ServerUnreachableState autoRetrying={false} />, { user: null });

    expect(screen.queryByText(/checking again automatically/i)).not.toBeInTheDocument();
  });
});

describe('states reached from real API responses', () => {
  it('turns a 403 into an explanation rather than an accusation', () => {
    renderError(
      <ErrorStateForError error={{ status: 403 }} resource="deck" backTo="/library" backLabel="Back" />,
      { user: TEST_USER },
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This deck is private');
    expect(screen.getByText(/ask them to make it public/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/library');
  });

  it('turns a resource 404 into a way back to the list it came from', () => {
    renderError(
      <ErrorStateForError
        error={{ status: 404 }}
        resource="word"
        resourceName="Haus"
        backTo="/dictionary"
        backLabel="Search the dictionary"
        inline
      />,
      { user: TEST_USER },
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent("We couldn't find that word");
    expect(screen.getByText(/There is no word called “Haus”/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /search the dictionary/i })).toHaveAttribute(
      'href',
      '/dictionary',
    );
  });

  it('does not steal focus or claim the page in the inline variant', async () => {
    const { container } = renderError(
      <div>
        <h1>Deck detail</h1>
        <ResourceNotFoundState resource="deck" backTo="/library" backLabel="Back to your library" inline />
      </div>,
      { user: TEST_USER },
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Deck detail');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent("We couldn't find that deck");
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders the forbidden page cleanly for axe in both variants', async () => {
    const page = renderError(<ForbiddenState resource="deck" backTo="/library" />, { user: TEST_USER });
    expect(await axe(page.container)).toHaveNoViolations();
  });

  it('prints the Sentry event id on the 500 page when there is one, and nothing when there is not', () => {
    const withId = renderError(<ServerErrorState eventId="9f2c1b7ae4d04c6f" />, { user: TEST_USER });
    expect(screen.getByText(/Reference for support: 9f2c1b7ae4d04c6f/)).toBeInTheDocument();
    withId.unmount();

    renderError(<ServerErrorState />, { user: TEST_USER });
    expect(screen.queryByText(/reference for support/i)).not.toBeInTheDocument();
  });
});
