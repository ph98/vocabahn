import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { trackError } from '../../lib/telemetry';
import { classifyError } from './classify';
import { ErrorStateForError } from './states';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Changing this clears a caught error. Pass the pathname so navigating away
   * from a broken page recovers instead of leaving the fallback stuck.
   */
  resetKey?: string;
  /** Renders the fallback inside its own full-height `<main>`, for use above the app shell. */
  standalone?: boolean;
}

interface ErrorBoundaryState {
  error: unknown;
  eventId?: string;
}

/**
 * Catches render-time throws below it and shows the designed state for them
 * instead of a blank document.
 *
 * The failure this exists for is not hypothetical: with the PWA's
 * `registerType: 'autoUpdate'`, a tab holding a stale `index.html` asks for a
 * content-hashed chunk that a redeploy removed, the `lazy()` import rejects,
 * and without a boundary React unmounts the whole tree. `classifyError`
 * recognises that shape specifically, so it is answered with "reload to get
 * the latest version" rather than a generic apology.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const eventId = trackError(error, {
      componentStack: info.componentStack,
      errorKind: classifyError(error),
    });
    if (eventId) this.setState({ eventId });
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ error: null, eventId: undefined });
  };

  render() {
    const { error, eventId } = this.state;
    if (!error) return this.props.children;

    const fallback = <ErrorStateForError error={error} eventId={eventId} onRetry={this.reset} />;

    if (!this.props.standalone) return fallback;

    return (
      <main className="flex min-h-dvh w-full flex-col items-center justify-center px-4 text-surface-100">
        {fallback}
      </main>
    );
  }
}

/** Suspense fallback for lazy-loaded routes; announced to screen readers. */
function RouteLoading() {
  return <p aria-live="polite">Loading…</p>;
}

/**
 * What the lazy route tree needs: a suspense fallback while a chunk loads, and
 * an error boundary for when that chunk never arrives. Resets on navigation,
 * so a link out of the error page works.
 */
export function RouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<RouteLoading />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

/**
 * Last-resort boundary above the app shell, for a throw in the shell itself —
 * where there is no `<main>` left to render into.
 */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <ErrorBoundary resetKey={pathname} standalone>
      {children}
    </ErrorBoundary>
  );
}
