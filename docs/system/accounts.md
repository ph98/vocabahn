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

## The googleId invariant

`User.googleId` is non-null and unique, so email-OTP users get a **synthetic**
one: `email:<address>` (`auth.service.ts:151`). Google users upsert on
`googleId`; OTP users upsert on `email`. The two keys are not reconciled.

Consequence: a user who first signs in by magic link and later uses Google with
the same address hits the `create` branch of a `googleId` upsert, which violates
the unique constraint on `email` and fails with a Prisma P2002. Account linking
does not exist.

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

- **Email magic-link sign-in does not work end to end.** The link points at
  `${FRONTEND_URL}/auth/verify?token=…` (`auth.service.ts:136`), but the SPA has
  no `/auth/verify` route and no code anywhere reads a `token` query param.
  nginx's `try_files $uri /index.html` serves the app shell, which renders the
  unauthenticated landing page and discards the token. The endpoint that would
  consume it is `GET /api/v1/auth/email/verify`. Not verified at runtime; the
  route table and a repo-wide grep both come up empty.
- No account linking between Google and email identities (above).
- No sign-out-everywhere, no refresh-token revocation list: a leaked refresh
  token is valid for 30 days. `POST /auth/logout` only clears cookies.
- `POST /auth/google/token` is **orphaned** — implemented for native clients,
  no consumer in this repo.
- Users cannot set their own CEFR level. `User.cefrLevel` is written only by
  level inference in `knowledge.service.ts`; there is no onboarding, no
  self-assessment, and no settings control.
- reCAPTCHA is not integrated anywhere, despite being described in the legacy
  PRD. `ContactMessage` exists as a model with no controller.
- Server-side user preferences do not exist. The only setting, "Autoplay audio
  during reviews", lives in `localStorage` under `vocabahn-settings`
  (`hooks/useSettings.ts`) and therefore does not follow the user across
  devices.
