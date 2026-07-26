# Accounts, Sessions, and Abuse Control

Identity, session transport, and every limit that protects the paid APIs.

Code: `apps/api/src/auth/`, `apps/web/src/hooks/useGoogleOneTap.ts`,
`apps/api/src/main.ts`, `apps/api/src/app.module.ts`.

## Sign-in paths

Four entry points, all landing on the same `User` upsert:

| Route | Flow | Used by |
| :--- | :--- | :--- |
| `GET /auth/google` → `GET /auth/google/redirect` | OAuth authorization-code, CSRF-protected by a `vb_oauth_state` cookie compared to the `state` param | web sign-in button |
| `POST /auth/google/onetap` | Verifies a One Tap credential (ID token), sets cookies | `useGoogleOneTap`, rendered only when `fetchMe()` resolves to null |
| `POST /auth/google/token` | Verifies an ID token, returns the token pair as JSON instead of cookies | reserved for a native client; no web caller |
| `POST /auth/email/request` → `GET /auth/email/verify` | 15-minute single-use magic link | email sign-in |

`google/redirect` is deliberately `VERSION_NEUTRAL` — the path registered in
the Google console is `/api/auth/google/redirect`, without `/v1`. Do not add
versioning to it.

Google ID tokens are rejected unless the payload carries `sub`, `email`, and
`email_verified === true`.

## Identity reconciliation and googleId

`User.googleId` is non-null and unique. Email-OTP users without a Google identity receive a **synthetic**
`googleId`: `email:<address>`.

Google sign-in (`signInWithIdToken`) searches for an existing user matching either `googleId` (`payload.sub`) or `email` (`payload.email`). If a match is found (such as a user created via email OTP), it updates the record with the Google `sub` ID and profile data, linking the accounts. Email OTP sign-in (`verifyEmailOtp`) looks up existing users by `email` and reuses the account without overwriting existing Google credentials.

## Session transport

Two `httpOnly`, `sameSite=lax` cookies, `secure` only when
`NODE_ENV=production` (`cookies.ts`):

- `vb_access` — 15 minutes, sent on every request, default path.
- `vb_refresh` — 30 days, **scoped to `path=/api/v1/auth`** so it is not
  attached to ordinary API traffic.

`JwtAuthGuard` accepts `vb_access` or an `Authorization: Bearer` header, and
rejects a refresh token used as an access token by checking the `type` claim.
The guard is opt-in per controller, not global.

Refresh rotates both tokens. The client's `fetchMe()` makes exactly one silent
`POST /auth/refresh` attempt on a 401, then settles into the signed-out state.
On any non-401 error it returns null rather than throwing — deliberately, so
react-query does not retry-storm the throttler across remounts
(`apps/web/src/api.ts:35`).

## Rate limiting and quotas

- Global: `ThrottlerGuard` as an `APP_GUARD`, 1000 requests / 60 s.
- Auth controller: 10 requests / 60 s.
- Enrichment: 50 new-word enrichments per user per UTC day, enforced by a Redis
  `INCR` with a 24 h TTL on `enrich:cap:<userId>:<YYYY-MM-DD>`
  (`enrichment.service.ts`). Configurable via `ENRICHMENT_DAILY_CAP`.
  **Observed** on the profile page as `0 / 50`.

`POST /auth/email/request` always returns 204, including for malformed
addresses, to avoid email enumeration. Previous unused OTPs for an address are
invalidated when a new one is issued.

## HTTP hardening

`main.ts`: `helmet()` with `crossOriginResourcePolicy: cross-origin` (so the web
origin can load enrichment audio), `cookie-parser`, CORS locked to
`FRONTEND_URL` with `credentials: true`, `trust proxy` enabled for correct
client IPs behind nginx, global prefix `api`, URI versioning defaulting to `v1`.

Generated TTS files are served as static assets from `/api/static`.

## Limitations

- No sign-out-everywhere, no refresh-token revocation list: a leaked refresh
  token is valid for 30 days. `POST /auth/logout` only clears cookies.
- `POST /auth/google/token` is **orphaned** — implemented for native clients,
  no consumer in this repo (#23).
- Learners can set and calibrate their own CEFR level (#25) during onboarding or via Profile Settings (`PATCH /auth/me` or `POST /knowledge/level`), seeding prior scores and triggering filler/high-prior auto-graduations immediately. Level inference also continues to update `User.cefrLevel` as reviews progress.
- reCAPTCHA is not integrated anywhere, despite being described in the legacy
  PRD. `ContactMessage` exists as a model with no controller.
- Server-side user preferences do not exist. The only setting, "Autoplay audio
  during reviews", lives in `localStorage` under `vocabahn-settings`
  (`hooks/useSettings.ts`) and therefore does not follow the user across
  devices.
