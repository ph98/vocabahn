import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Compass,
  Home,
  Lock,
  RefreshCw,
  Search,
  ServerCrash,
  SearchX,
  Sparkles,
  Unplug,
  WifiOff,
  Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { fetchMe } from '../../api';
import { reloadToLatestVersion } from '../../lib/app-update';
import { classifyError } from './classify';
import { ErrorAction, ErrorState } from './ErrorState';

/**
 * The "go home" way out, worded for whoever is looking at it.
 *
 * `/` is the dashboard when signed in and the landing page when signed out, so
 * a fixed "Return to dashboard" label lies to half the people who see it. This
 * subscribes to the cached `['me']` result but never issues a request of its
 * own — an error page must not add load to an API that may be the problem.
 */
function useHomeAction(): { to: string; label: string } {
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false, enabled: false });
  return { to: '/', label: user ? 'Go to your dashboard' : 'Go to the home page' };
}

/** The catch-all route: a URL with no page behind it. */
export function RouteNotFoundState() {
  const home = useHomeAction();
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false, enabled: false });

  return (
    <ErrorState
      icon={Compass}
      code="404"
      title="This page doesn't exist"
      description="The address may have a typo, or the link that brought you here may be out of date."
      actions={
        <>
          <ErrorAction to={home.to} icon={Home} variant="primary">
            {home.label}
          </ErrorAction>
          {user && (
            <ErrorAction to="/dictionary" icon={Search}>
              Search the dictionary
            </ErrorAction>
          )}
        </>
      }
    />
  );
}

export interface ResourceNotFoundStateProps {
  /** Singular noun for the thing that is missing: `deck`, `course`, `word`, `story`. */
  resource: string;
  /** The specific one that was asked for, when naming it helps. */
  resourceName?: string;
  /** Where the user came from, so there is a real way back to the list. */
  backTo?: string;
  backLabel?: string;
  inline?: boolean;
}

/**
 * The URL was a real route but the thing behind it is not there — a deleted
 * deck, a word with no dictionary entry. Different from a route-level 404: the
 * way out is back to the list it came from, not the home page.
 */
export function ResourceNotFoundState({
  resource,
  resourceName,
  backTo,
  backLabel,
  inline = false,
}: ResourceNotFoundStateProps) {
  const home = useHomeAction();

  return (
    <ErrorState
      inline={inline}
      icon={SearchX}
      code={inline ? undefined : 'Not found'}
      title={`We couldn't find that ${resource}`}
      description={
        resourceName
          ? `There is no ${resource} called “${resourceName}”. It may have been removed, or renamed.`
          : `It may have been deleted, or the link may point at a ${resource} that no longer exists.`
      }
      actions={
        backTo ? (
          <ErrorAction to={backTo} icon={ArrowLeft} variant={inline ? 'secondary' : 'primary'}>
            {backLabel ?? 'Go back'}
          </ErrorAction>
        ) : (
          <ErrorAction to={home.to} icon={Home} variant={inline ? 'secondary' : 'primary'}>
            {home.label}
          </ErrorAction>
        )
      }
    />
  );
}

export interface ForbiddenStateProps {
  /** Singular noun for the thing that is private, when it is known. */
  resource?: string;
  backTo?: string;
  backLabel?: string;
  inline?: boolean;
}

/** Forbidden. Explain rather than accuse: the thing is private, the person is not a suspect. */
export function ForbiddenState({ resource = 'page', backTo, backLabel, inline = false }: ForbiddenStateProps) {
  const home = useHomeAction();

  return (
    <ErrorState
      inline={inline}
      icon={Lock}
      code={inline ? undefined : 'Private'}
      tone="warning"
      title={`This ${resource} is private`}
      description={`Whoever created it hasn't shared it. If you think it should be yours to open, ask them to make it public.`}
      actions={
        <>
          {backTo && (
            <ErrorAction to={backTo} icon={ArrowLeft} variant={inline ? 'secondary' : 'primary'}>
              {backLabel ?? 'Go back'}
            </ErrorAction>
          )}
          <ErrorAction to={home.to} icon={Home} variant={backTo || inline ? 'secondary' : 'primary'}>
            {home.label}
          </ErrorAction>
        </>
      }
    />
  );
}

export interface ServerErrorStateProps {
  /** Sentry event id, when one was captured — makes a user report traceable. */
  eventId?: string;
  onRetry?: () => void;
  inline?: boolean;
}

/** A 5xx, or an uncaught render error. Retry first, report second. */
export function ServerErrorState({ eventId, onRetry, inline = false }: ServerErrorStateProps) {
  const home = useHomeAction();

  return (
    <ErrorState
      inline={inline}
      icon={ServerCrash}
      code={inline ? undefined : '500'}
      tone="danger"
      title="Something went wrong on our end"
      description="This one is on us, not on you — nothing you were working on was lost. Trying again usually works; if it doesn't, the status page shows whether the problem is widespread."
      actions={
        <>
          {onRetry && (
            <ErrorAction onClick={onRetry} icon={RefreshCw} variant={inline ? 'secondary' : 'primary'}>
              Try again
            </ErrorAction>
          )}
          <ErrorAction to={home.to} icon={Home} variant={onRetry || inline ? 'secondary' : 'primary'}>
            {home.label}
          </ErrorAction>
          {!inline && <ErrorAction to="/status">System status</ErrorAction>}
        </>
      }
      footnote={eventId ? `Reference for support: ${eventId}` : undefined}
    />
  );
}

export interface ServerUnreachableStateProps {
  /** True while a check is in flight right now. Shows the spinner and disables the manual retry. */
  isRetrying?: boolean;
  /** Seconds until the next automatic check, when the caller knows. Shown, not announced. */
  retryInSeconds?: number | null;
  /** Set false when nothing is polling, so the page doesn't promise a retry that never comes. */
  autoRetrying?: boolean;
  /** Manual "try again now". */
  onRetry?: () => void;
  inline?: boolean;
}

/**
 * The backend is not answering at all.
 *
 * Deliberately free of any router-error or boundary coupling: it takes plain
 * props so it can be rendered from wherever the outage is actually detected —
 * including the auth gate, where a failed `/auth/me` would otherwise look like
 * being signed out.
 */
export function ServerUnreachableState({
  isRetrying = false,
  retryInSeconds,
  autoRetrying = true,
  onRetry,
  inline = false,
}: ServerUnreachableStateProps) {
  let status: ReactNode;
  if (isRetrying) {
    status = 'Checking now…';
  } else if (autoRetrying) {
    status = (
      <>
        Checking again automatically
        {typeof retryInSeconds === 'number' && (
          <span aria-hidden="true"> — next check in {Math.max(retryInSeconds, 0)}s</span>
        )}
      </>
    );
  }

  return (
    <ErrorState
      inline={inline}
      icon={Unplug}
      code={inline ? undefined : 'Server unreachable'}
      tone="warning"
      busy={isRetrying}
      title="We can't reach Vocabahn right now"
      description="Your account and your progress are safe — this is our server, not your connection or your sign-in."
      status={status}
      actions={
        <>
          {onRetry && (
            <ErrorAction
              onClick={onRetry}
              icon={RefreshCw}
              variant={inline ? 'secondary' : 'primary'}
              disabled={isRetrying}
            >
              Try again now
            </ErrorAction>
          )}
          <ErrorAction to="/status" variant={onRetry || inline ? 'secondary' : 'primary'}>
            System status
          </ErrorAction>
        </>
      }
    />
  );
}

/** The device has no network. Point at what still works without one. */
export function OfflineState({ onRetry, inline = false }: { onRetry?: () => void; inline?: boolean }) {
  return (
    <ErrorState
      inline={inline}
      icon={WifiOff}
      code={inline ? undefined : 'Offline'}
      tone="warning"
      title="You're offline"
      description="Your review session still works: ratings are saved on this device and sync as soon as you're back. Words you've opened recently are readable from the cache."
      actions={
        <>
          <ErrorAction to="/review" variant={inline ? 'secondary' : 'primary'}>
            Continue reviewing
          </ErrorAction>
          {onRetry && (
            <ErrorAction onClick={onRetry} icon={RefreshCw}>
              Try again
            </ErrorAction>
          )}
        </>
      }
    />
  );
}

/**
 * A dynamic import failed because this tab is running a build that has since
 * been replaced. The only fix is to pick up the new one, so that is the only
 * thing this page offers.
 */
export function NewVersionAvailableState({
  onReload = () => void reloadToLatestVersion(),
  inline = false,
}: {
  onReload?: () => void;
  inline?: boolean;
}) {
  return (
    <ErrorState
      inline={inline}
      icon={Sparkles}
      code={inline ? undefined : 'Update ready'}
      title="A new version of Vocabahn is ready"
      description="This tab is still running an older copy of the app, so part of it couldn't load. Reloading picks up the latest version — nothing you were working on is lost."
      actions={
        <ErrorAction onClick={onReload} icon={RefreshCw} variant="primary">
          Reload to get the latest version
        </ErrorAction>
      }
    />
  );
}

/** Planned downtime, shown only when something explicitly says so. */
export function MaintenanceState({ eta, inline = false }: { eta?: string; inline?: boolean }) {
  return (
    <ErrorState
      inline={inline}
      icon={Wrench}
      code={inline ? undefined : 'Maintenance'}
      tone="warning"
      title="Vocabahn is down for scheduled maintenance"
      description={eta ? `We expect to be back ${eta}.` : 'We will be back as soon as the work is finished.'}
      actions={<ErrorAction to="/status" variant="primary">System status</ErrorAction>}
    />
  );
}

export interface ErrorStateForErrorProps {
  error: unknown;
  /** Sentry event id captured for this error, when there is one. */
  eventId?: string;
  /** Singular noun for the resource being fetched — turns a 404 into a resource-404. */
  resource?: string;
  resourceName?: string;
  backTo?: string;
  backLabel?: string;
  onRetry?: () => void;
  inline?: boolean;
}

/**
 * The central mapping from a thrown value to a designed state. Use this rather
 * than branching on status codes per component, so a 403 from any endpoint
 * lands on the same page.
 */
export function ErrorStateForError({
  error,
  eventId,
  resource,
  resourceName,
  backTo,
  backLabel,
  onRetry,
  inline = false,
}: ErrorStateForErrorProps) {
  switch (classifyError(error)) {
    case 'stale-chunk':
      return <NewVersionAvailableState inline={inline} />;
    case 'offline':
      return <OfflineState onRetry={onRetry} inline={inline} />;
    case 'unreachable':
      return <ServerUnreachableState onRetry={onRetry} autoRetrying={false} inline={inline} />;
    case 'forbidden':
      return <ForbiddenState resource={resource} backTo={backTo} backLabel={backLabel} inline={inline} />;
    case 'not-found':
      return resource ? (
        <ResourceNotFoundState
          resource={resource}
          resourceName={resourceName}
          backTo={backTo}
          backLabel={backLabel}
          inline={inline}
        />
      ) : (
        <RouteNotFoundState />
      );
    case 'server':
    case 'unknown':
    default:
      return <ServerErrorState eventId={eventId} onRetry={onRetry} inline={inline} />;
  }
}
