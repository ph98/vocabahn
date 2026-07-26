import type { CookieOptions, Response } from 'express';

export const ACCESS_COOKIE = 'vb_access';
export const REFRESH_COOKIE = 'vb_refresh';
export const OAUTH_STATE_COOKIE = 'vb_oauth_state';

export const ACCESS_TTL_MS = 15 * 60 * 1000; // 15 min
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const base: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

// Refresh cookie is scoped to the auth routes so it isn't sent on every request.
const refreshPath = '/api/v1/auth';

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: ACCESS_TTL_MS });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    path: refreshPath,
    maxAge: REFRESH_TTL_MS,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, { ...base, path: refreshPath });
}

export function setOauthStateCookie(res: Response, state: string) {
  res.cookie(OAUTH_STATE_COOKIE, state, { ...base, path: '/', maxAge: 10 * 60 * 1000 });
}

export function clearOauthStateCookie(res: Response) {
  res.clearCookie(OAUTH_STATE_COOKIE, { ...base, path: '/' });
}
