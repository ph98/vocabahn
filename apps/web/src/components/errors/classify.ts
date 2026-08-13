import { isAxiosError } from 'axios';

/**
 * Every failure the UI has a designed answer for.
 *
 * `classifyError` is the single place an unknown thrown value becomes one of
 * these, so a 403 from any endpoint — or a render throw from any component —
 * lands on the same page instead of on whatever that component happened to do.
 */
export type ErrorKind =
  | 'stale-chunk'
  | 'offline'
  | 'unreachable'
  | 'forbidden'
  | 'not-found'
  | 'server'
  | 'unknown';

/**
 * Wordings browsers use when a dynamic `import()` cannot be fetched. The PWA
 * registers with `registerType: 'autoUpdate'`, so a tab still holding the
 * previous deploy's `index.html` asks for a content-hashed chunk that no
 * longer exists — the `lazy()` promise rejects with one of these.
 */
const STALE_CHUNK_PATTERNS = [
  /failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /importing a module script failed/i, // Safari
  /unable to preload css/i, // Vite's CSS preload helper
  /'text\/html' is not a valid javascript mime type/i, // SPA fallback served for a missing chunk
];

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return '';
}

/** True when the failure is "the JS chunk this page asked for is gone", i.e. the app was redeployed under this tab. */
export function isStaleChunkError(error: unknown): boolean {
  if (!error) return false;
  const name = error instanceof Error ? error.name : (error as { name?: unknown })?.name;
  if (name === 'ChunkLoadError') return true;
  const message = messageOf(error);
  return message !== '' && STALE_CHUNK_PATTERNS.some((pattern) => pattern.test(message));
}

/** The HTTP status the server actually answered with, or undefined if it never answered. */
export function httpStatus(error: unknown): number | undefined {
  if (isAxiosError(error)) return error.response?.status;
  if (error && typeof error === 'object') {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Maps any thrown value to the error state that should be shown for it.
 *
 * Order matters: a status code proves the network worked, so it wins over the
 * offline check; and a failed module import while the device is offline is an
 * offline problem, not a stale deploy.
 */
export function classifyError(error: unknown): ErrorKind {
  const status = httpStatus(error);
  if (status !== undefined) {
    if (status === 403) return 'forbidden';
    if (status === 404) return 'not-found';
    if (status >= 500) return 'server';
    return 'unknown';
  }

  if (isStaleChunkError(error)) return isOffline() ? 'offline' : 'stale-chunk';
  if (isOffline()) return 'offline';

  if (isAxiosError(error) && (error.code === 'ERR_NETWORK' || error.request)) return 'unreachable';

  return 'unknown';
}
