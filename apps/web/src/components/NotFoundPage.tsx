import { RouteNotFoundState } from './errors';

/** The catch-all route. One usage of the shared error page, not a template. */
export function NotFoundPage() {
  return <RouteNotFoundState />;
}
