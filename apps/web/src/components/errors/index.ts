/**
 * Error presentation for the whole app.
 *
 * One component (`ErrorState`) backs every state; the variants below are its
 * usages, not templates to copy. `ErrorStateForError` is the central mapping
 * from a thrown value to one of them, and `RouteBoundary` / `AppErrorBoundary`
 * are what make render-time throws reach it.
 *
 * Every state renders standalone — no router error, no app nav, no signed-in
 * user required — so the same page serves a signed-out visitor.
 */
export { ErrorAction, ErrorState, type ErrorActionProps, type ErrorStateProps, type ErrorTone } from './ErrorState';

export {
  ErrorStateForError,
  ForbiddenState,
  MaintenanceState,
  NewVersionAvailableState,
  OfflineState,
  ResourceNotFoundState,
  RouteNotFoundState,
  ServerErrorState,
  ServerUnreachableState,
  type ErrorStateForErrorProps,
  type ForbiddenStateProps,
  type ResourceNotFoundStateProps,
  type ServerErrorStateProps,
  type ServerUnreachableStateProps,
} from './states';

export { AppErrorBoundary, ErrorBoundary, RouteBoundary } from './ErrorBoundary';

export { classifyError, httpStatus, isStaleChunkError, type ErrorKind } from './classify';
