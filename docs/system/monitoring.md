# Monitoring and End-to-End Checks

How a Vocabahn outage becomes something a human hears about, and what the
end-to-end suite does and does not prove.

Code: `playwright.config.ts`, `e2e/`, `scripts/health-check.sh`,
`.github/workflows/ci.yml`, `.github/workflows/monitor-health.yml`,
`.github/workflows/monitor-e2e.yml`, `.github/actions/`.

## Two suites in one directory

`e2e/` holds two sets of specs with opposite trade-offs, separated by the
`@monitor` tag and by Playwright projects that `grep` on it.

| Project | Specs | Backend | Runs |
| :--- | :--- | :--- | :--- |
| `chromium`, `mobile-safari` | `e2e/*.spec.ts` | mocked (`page.route`) | every push and pull request |
| `monitor` | `e2e/monitor/*.spec.ts` | none — real deployment | scheduled, and after every deploy |

The mocked specs stub `/api/v1/auth/me`, `/api/v1/health` and whatever else a
test needs, so they run in seconds with no database, no account and no network.
Pointed at a deployed URL they would pass with the API completely down, because
they never call it. `grepInvert: /@monitor/` on those projects and `grep:
/@monitor/` on `monitor` keep each set out of the other's context.

`pnpm e2e` runs the mocked pair. `pnpm e2e:monitor` runs the live one and
requires the configuration below.

One trap when running locally: `webServer.reuseExistingServer` is true outside
CI, so if anything is already listening on port 5173 — another checkout of this
repo, a dev server left running — Playwright will happily test *that* instead of
your working tree and report confidently wrong results. Either stop it first or
point the run at your own server with `E2E_BASE_URL`.

## Local versus deployed targets

`playwright.config.ts` boots a Vite dev server **only when `E2E_BASE_URL` is
unset**. With it set, `webServer` is `undefined` — starting Vite in front of
staging would serve a locally built SPA against a remote API and quietly test
something nobody ships.

## Layer 1 — health, every five minutes

`monitor-health.yml` runs `scripts/health-check.sh` against staging and
production. The script requires `"status":"ok"` from `/api/v1/health`, not just
a 200: the endpoint answers 200 with `"degraded"` when Postgres or Redis is
unreachable.

It probes **twice, 45 seconds apart, and fails only when both probes fail**. A
single missed probe is a redeploy or a dropped packet, and paging on one is how
an alert channel gets muted. Both probes happen inside one run, so no state is
carried between scheduled runs and detection stays fast.

Five minutes is the finest cadence GitHub's scheduler offers, and it runs crons
best-effort — under load a run is delayed or skipped. Sub-minute or multi-region
checks would need a hosted synthetic-monitoring service instead.

## Layer 2 — the real journey, every thirty minutes

`monitor-e2e.yml` runs the `monitor` project against both environments. It
mocks nothing and asserts, in this order:

1. **Sign-in.** A magic link is requested through the landing-page form, read
   out of a real mailbox, and followed. Google OAuth is not automatable
   (bot detection, consent screens, 2FA); the email path is.
2. **`/auth/me` and reload.** The API identifies the account, and a reload keeps
   the session.
3. **Token refresh.** `POST /auth/refresh` rotates both cookies and the rotated
   access token still authorises — then `vb_access` is deleted outright and a
   reload must still land signed in, exercising the silent refresh in
   `fetchMe()`. This is the highest-value assertion in the suite: `vb_access`
   lives fifteen minutes, so every learner takes that path several times a
   session, and a break there logs everyone out with nothing else looking wrong.
4. **Dictionary search** returns results from the live index.
5. **A due card** loads and a rating reaches the API. The assertion is on the
   POST's response, not the UI, because `ReviewSession` deliberately falls back
   to the offline queue when the request fails — a card that looks rated proves
   nothing.

The suite runs serially. `requestEmailOtp` invalidates an address's previous
unused token, so two parallel sign-ins would race each other.

### Why the run takes about two and a half minutes

`AuthController` allows ten requests per minute per IP, and this suite lives on
exactly those endpoints. The budget goes faster than it looks: one signed-out
page load already costs three — `/auth/me`, the silent `/auth/refresh` behind
it, and `/auth/config` — so a full sign-in spends nearly the whole window.
**Observed** on a live stack: the unpaced suite issued 21 auth requests in about
three seconds, and past the tenth `fetchMe` saw a 429, returned null by design,
and the app rendered signed out — indistinguishable from a broken session.

So `letAuthThrottleWindowLapse` (`e2e/support/auth-throttle.ts`) waits out a
full window between phases, twice. Two minutes of waiting inside a run that
happens every thirty is the price of an alert that means something.

The `monitor` project retries once in CI rather than the default two: one retry
absorbs a redeploy landing mid-run, a second starts hiding a failure that
reproduces one time in three, and each attempt costs another sign-in and two
more throttle windows.

`purgeMagicLinks` empties the mailbox of sign-in emails *before* asking for a
new one. Without it the first poll can return a leftover token from an earlier
run — already spent, since a new request invalidates the previous one — and the
run fails at the redirect with nothing to explain why.

The monitoring specs never open a word page. Viewing an unenriched entry
enqueues a paid enrichment job against that account's daily cap
(`enrichment.md`), and a check running 48 times a day would spend it.

## Reading the magic link

`waitForMagicLinkToken` (`e2e/support/mailbox.ts`) polls an IMAP mailbox for the
`Your Vocabahn sign-in link` message and extracts the token from it, trying the
raw source, a quoted-printable decode and a base64 decode, because the transfer
encoding is the relay's choice and both common ones mangle the URL.

**Why not read `EmailOtp.token` from Postgres.** Postgres has no host port and
no public listener (`docker-compose.prod.yml` puts it on an internal Docker
network), so a CI runner could only reach it by holding shell access to the
VPS — a far larger grant than a monitoring job should have. And the row proves
only that a token was minted: a relay that has stopped delivering would leave
the check green while nobody in the world could sign in.

The costs of the mailbox are real and worth stating. It adds delivery latency,
so the sign-in test allows two minutes and the whole run is slower. It cannot
tell "the API issued no token" apart from "the mail was slow" — both surface as
the same timeout. And it needs a mailbox credential in CI.

## Analytics exclusion

`excludeFromAnalytics` (`e2e/support/analytics.ts`) seeds
`localStorage.vocabahn_consent = 'denied'` before any page script runs, which
stops `initGA4` from injecting the tag at all, and additionally aborts requests
to Google Tag Manager, Google Analytics, DoubleClick and Sentry ingest hosts. A
monitoring account signing in every half hour would otherwise be one of the most
engaged users on the property.

## Deploy gating

`ci.yml` wires all of it into the pipeline:

- `e2e` (mocked, chromium and mobile-safari) blocks both deploy jobs.
- A push to `main` deploys staging, then `smoke-staging` runs the `monitor`
  project against it.
- A `v*` tag runs `verify-staging` — the same live suite against staging, which
  is already running the commit being promoted — **before** `deploy-production`.
- `smoke-production` runs the live suite again after the production deploy.

## Alerting

`.github/actions/notify-failure` files a GitHub issue labelled `monitoring`, one
per (check, environment), commenting on the existing open issue rather than
filing a new one every half hour. It needs no secret, so alerting cannot end up
silently unconfigured. When `MONITOR_ALERT_WEBHOOK_URL` is set it also posts to
that webhook with both `text` and `content` fields, which covers Slack and
Discord without a format flag.

Playwright's HTML report, traces (`on-first-retry`) and screenshots
(`only-on-failure`) upload as run artifacts and are retained for 14 days.

## Configuration

Repository **variables** (optional; the defaults below apply when unset):

| Variable | Default |
| :--- | :--- |
| `STAGING_URL` | `https://staging.vocabahn.app` |
| `PRODUCTION_URL` | `https://vocabahn.app` |

Repository **secrets**:

| Secret | Shape | Used by |
| :--- | :--- | :--- |
| `MONITOR_EMAIL_STAGING` | address of the staging monitoring account | live e2e, staging |
| `MONITOR_EMAIL_PRODUCTION` | address of the production monitoring account | live e2e, production |
| `MONITOR_IMAP_HOST` | hostname, e.g. `imap.gmail.com` | mailbox reader |
| `MONITOR_IMAP_PORT` | defaults to `993` | mailbox reader |
| `MONITOR_IMAP_USER` | defaults to the monitoring address | mailbox reader |
| `MONITOR_IMAP_PASSWORD` | mailbox password or app password | mailbox reader |
| `MONITOR_IMAP_MAILBOX` | defaults to `INBOX` | mailbox reader |
| `MONITOR_ALERT_WEBHOOK_URL` | optional Slack/Discord incoming webhook | alerting |

The same names work as environment variables for a local `pnpm e2e:monitor`
run, alongside `E2E_BASE_URL` and `MONITOR_EMAIL`. Absent any of the required
ones, the run fails with the list of what is missing — deliberately, since a
monitoring run that skips its assertions is worse than none.

`MONITOR_COURSE_SLUG` (default `cefr-a1`) is the course the monitoring account
is enrolled in when it has no cards due.

## Limitations

- Both monitoring accounts sign in through the email path only. Google OAuth,
  One Tap, and `POST /auth/google/token` have no live coverage at all, and
  `landing.spec.ts` only reads the sign-in link's `href`.
- The mailbox reader cannot distinguish a missing token from slow delivery; both
  present as the same two-minute timeout.
- GitHub's cron is best-effort, so the five-minute health cadence is a ceiling,
  not a guarantee, and a delayed run reports late rather than reporting a gap.
- Monitoring writes to the deployed database — a `User`, an enrolment, a
  `ReviewLog` row every half hour. That data is disposable but is not cleaned
  up, and it is counted by the dashboard and knowledge-model queries like any
  other account's.
- Excluding monitoring traffic from GA4 relies on the run never granting
  consent. Nothing on the server side distinguishes the monitoring account, so a
  future analytics path that does not check consent would include it.
- Only `chromium` runs against live environments; a WebKit-only breakage in
  production is not covered.
- The live suite spends most of the auth controller's per-minute budget, so it
  paces itself with two fixed one-minute waits rather than measuring the
  remaining allowance. If the throttle is ever tightened, the pacing has to be
  revisited by hand.
- The deploy gates (`smoke-staging`, `verify-staging`, `smoke-production`) fail
  when the monitoring secrets are absent. That is deliberate — a gate that
  passes when unconfigured is not a gate — but it does mean production
  promotion is blocked until the mailbox secrets exist.
- The live suite asserts that a signed-in session survives an outage of its
  *access* token, but has no assertion for what the app shows while the API is
  wholly unreachable. It fails in that case, which is the point, but it fails on
  "the navigation never appeared" rather than on "the outage state was shown".
