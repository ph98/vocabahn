import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../api';

const HEALTH_QUERY_KEY = ['health'] as const;

/** How often the footer's status dot asks the API whether it is alive. */
export const HEALTH_POLL_INTERVAL_MS = 5000;

/**
 * The app's one and only `/health` poll.
 *
 * Mounted once, by the footer's status dot, which is outside every auth branch
 * and therefore alive during an outage too. `retry: false` is deliberate: a
 * poll that also retries turns one failed check into four, which is the
 * opposite of backing off while the API is struggling.
 */
export function useHealthPoll() {
  return useQuery({
    queryKey: HEALTH_QUERY_KEY,
    queryFn: fetchHealth,
    refetchInterval: HEALTH_POLL_INTERVAL_MS,
    retry: false,
  });
}

/**
 * Reads whatever {@link useHealthPoll} last saw, without issuing a request of
 * its own.
 *
 * This is how the outage page auto-recovers: it watches the poll that already
 * exists rather than starting a second one, so the number of requests during an
 * outage does not grow with the number of things waiting for it to end.
 */
export function useHealthSignal() {
  return useQuery({ queryKey: HEALTH_QUERY_KEY, queryFn: fetchHealth, enabled: false });
}
