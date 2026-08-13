# Notifications

One notification exists: a daily study reminder, sent by Web Push at a time the
learner chooses, in their own timezone, and only when there is something to say.

Code: `apps/api/src/notifications/`, `apps/web/src/lib/push.ts`,
`apps/web/src/hooks/useNotificationSettings.ts`,
`apps/web/src/components/DailyReminderSection.tsx`,
`apps/web/public/push-sw.js`, `packages/shared/src/notifications.ts`.

## Why Web Push and not the Notification API

The point of a reminder is to reach a learner who is *not* using the app. The
local `Notification` API only fires while a tab is open, and the Notification
Triggers API that would allow offline local scheduling has not shipped in any
browser. So: a service worker, a VAPID keypair, and a server that sends at the
scheduled moment. Nothing about this works client-side.

## The flow

1. The learner presses **Remind me daily** in Profile. That click — and only
   that click — calls `Notification.requestPermission()`.
2. On a grant, the browser subscribes with the server's VAPID public key and
   `POST /notifications/subscribe` stores the endpoint and its two keys.
3. `PUT /notifications/settings` writes `reminderEnabled` on the `User` row.
   The preference is written *after* the subscription exists, so a learner who
   dismisses the prompt is never left switched on with nothing to send to.
4. `ReminderProcessor` sweeps every 15 minutes and sends to whoever has reached
   their chosen minute.
5. The service worker's `push` handler shows the notification;
   `notificationclick` focuses an open tab or opens `/review?notif=…`.

## The sweep

`ReminderProcessor` registers one repeatable job on the `study-reminder` queue
at `*/15 * * * *`, with a fixed `jobId` so restarts and replicas do not multiply
it. This is structurally the daily-story sweep (`stories.md`) with a different
payload, and deliberately so — the correctness problem is the same one.

`reminderSlot` (`reminder-schedule.ts`, pure and clock-injected, unit-tested)
answers whether it is a learner's moment, and returns **the local date key the
send belongs to** rather than a boolean. The date key is what the caller claims
in Redis, and near midnight the two differ: a 23:50 reminder picked up by the
00:05 sweep belongs to the day that just ended. Attributing it to the new day
would let the same learner be pushed twice inside twenty minutes.

Because the sweep ticks on UTC quarter-hours while learners in `+05:30` and
`+05:45` zones see local `:30` and `:45`, matching on equality would make most
chosen times unreachable. The rule is instead "at or after the chosen time,
within `REMINDER_CATCH_UP_MINUTES` (90)". That also means a deploy or an outage
that swallows several ticks produces a slightly late reminder rather than none,
while a learner who opts in at 22:00 with a 19:00 time is not pushed at
instantly.

A learner with no stored timezone falls back to UTC rather than being skipped;
one whose stored timezone Intl cannot parse is skipped rather than taking the
sweep down.

Three things keep the send exactly-once and worth receiving:

- `reminder:daily:<userId>:<localDateKey>` is claimed with Redis `SET NX` (36 h
  TTL) **before** the copy is decided. Whichever replica arrives first sends, a
  sweep that runs twice in one window sends once, and the stats queries below
  run once per learner per day rather than 96 times.
- **Nobody who has already reviewed today is sent anything.** Nothing is more
  annoying than being nagged for something you did.
- Nobody with zero cards due is sent anything either — "0 cards due today" is
  not a reason to open an app.
- One learner's failure is caught and logged, so it cannot stop the sweep for
  everyone else whose moment it also is.

## What it says

`buildReminderMessage` (`reminder-copy.ts`, pure and unit-tested) produces

> **12 cards due today** — 5 minutes keeps your 9-day streak.

The number is the point. A generic "time to study!" is the notification
everyone turns off; a count is a fact the learner can act on or dismiss on its
merits. `dueToday` uses the dashboard's definition — active cards falling due
before the learner's local midnight — so the notification and the screen it
opens agree. A streak under two days is not named: "keeps your 1-day streak" is
a weaker reason to open the app than no reason at all.

## Subscriptions

`PushSubscription` is one browser on one device: endpoint, `p256dh`, `auth`, an
untrusted user-agent label, and `lastUsedAt`. The endpoint is unique, so
re-subscribing the same browser updates the row rather than adding a second.

A `404` or `410` from the push service means the browser dropped the
subscription — site data cleared, PWA uninstalled, permission revoked without
telling us — and the row is **deleted**. Every other failure is transient and
the row is kept: a 503 is not a dead endpoint.

`PushProvider.send` never throws. Delivery is best-effort by design, and a
reminder is the least important thing this server does.

## Turning it off

`PUT /notifications/settings { reminderEnabled: false }` deletes **every** stored
subscription for the account, not just the preference. An off switch that leaves
the server holding a live endpoint is not an off switch, and the learner has no
way to check. The client also unsubscribes the browser and calls
`DELETE /notifications/subscribe` for its own endpoint first; both are
best-effort, and the settings write is the authoritative one.

## Server-side settings

This is the app's **first genuinely server-backed setting**. `useSettings`
(`web-client.md`) is `localStorage`, which is fine for autoplay and useless
here: a flag in a browser cannot stop a server from sending a push, and clearing
site data would silently switch reminders back on.

The API is scoped to `/notifications` rather than named `/settings`, because the
only setting that has to live on the server is one the server itself acts on.

| Route | Does |
| :--- | :--- |
| `GET /notifications/settings` | Preference, time, timezone, `pushConfigured`, VAPID public key, device count |
| `PUT /notifications/settings` | Writes preference / time / timezone; `false` also deletes subscriptions |
| `POST /notifications/subscribe` | Upserts this browser on its endpoint |
| `DELETE /notifications/subscribe` | Drops one endpoint, or all of them |

Every settings write carries the browser's own `Intl` timezone, so a learner who
travels gets their reminder at the new local time without having to think about
it. A zone Intl cannot parse is dropped rather than rejected — it can only ever
arrive from a browser we do not control, and losing the whole save over it would
strand the learner's actual preference. **This is the only thing in the codebase
that writes `User.timezone`**, which until now was read by the daily-story sweep
and never populated.

## The three states in the UI

`DailyReminderSection` renders one of five things, and never a switch that
silently does nothing:

| State | Shown |
| :--- | :--- |
| `pushConfigured: false` | "Reminders aren't set up on this server yet." No control. |
| iOS Safari, not installed | The Share → Add to Home Screen instruction. No control. |
| No Push API at all | Which browsers can. No control. |
| `Notification.permission === 'denied'` | That it is blocked and must be re-allowed in browser settings — we cannot ask again. |
| Otherwise | The button, and once on, a time picker and the timezone it is read in. |

The permission prompt is one-shot per origin. Firing it on page load gets it
denied by reflex, permanently, with no way for the app to ask again — so it is
reached from exactly one click. `describePushSupport()` distinguishes iOS
Safari's missing `PushManager` (which means "install the app", two taps away)
from a genuinely unsupported browser, because reporting the first as the second
would be both wrong and unactionable.

## The service worker

The PWA runs `vite-plugin-pwa` in `generateSW` mode, where Workbox writes the
whole worker and there is nowhere to add a `push` listener. Rather than switch
to `injectManifest` and own the precache and routing by hand, the generated
worker `importScripts('/push-sw.js')` — configured through
`workbox.importScripts` in `apps/web/vite.config.ts`.

The parts Workbox generates are load-bearing and have each been fixed once
already: `skipWaiting` / `clientsClaim`, the `navigateFallbackDenylist` for
`/api/`, and three runtime-caching rules an offline review session depends on
(`web-client.md`). Re-implementing them to add sixty lines of push handling is
not a trade worth making.

Two consequences follow:

- `public/push-sw.js` is plain JavaScript: not bundled, not type-checked, and
  not able to import `pushPayloadSchema` from `packages/shared`. The payload
  contract is duplicated there as a comment.
- Imported worker scripts are served from the HTTP cache by default
  (`updateViaCache: 'imports'`), and the filename never changes, so all three
  nginx configs serve `/push-sw.js` `no-store` beside `sw.js`. Without that the
  static-asset rule would hand it a one-year immutable cache.

It is excluded from the precache manifest (`globIgnores`): the worker fetches it
directly, so precaching would only store a byte-identical second copy.

The handler treats the payload as untrusted — it arrives over a third-party push
service — and opens only same-origin paths.

## Analytics

`notification_opt_in`, `notification_opt_out` and `notification_click` go to GA4
through the existing `trackEvent`. The click event is reconstructed on the
client: the service worker opens `/review?notif=daily_reminder`, and
`consumeNotificationSource()` reads the marker in `main.tsx` before anything
renders, fires the event, and strips it from the address bar.

## Configuration

| Variable | Default | Effect |
| :--- | :--- | :--- |
| `VAPID_PUBLIC_KEY` | — | Unset disables sending entirely. Generate with `npx web-push generate-vapid-keys`. |
| `VAPID_PRIVATE_KEY` | — | As above. Both must be set; either alone counts as unset. |
| `VAPID_SUBJECT` | `mailto:support@vocabahn.app` | Contact address the push service can reach the sender at. |

With the keys unset the app boots normally, the sweep returns immediately, the
settings endpoint reports `pushConfigured: false`, and the UI says reminders are
unavailable — the same contract `UnsplashProvider` keeps for a missing key
(`enrichment.md`).

**Changing the keypair invalidates every stored subscription.** Existing rows
will start returning errors and are only pruned on a `404`/`410`; some services
answer `403` instead, which is treated as transient and kept. Rotate by clearing
`PushSubscription` at the same time.

## Limitations

- Only one notification exists. Streak-about-to-break, "your cards are piling
  up" and a weekly recap are not built.
- The daily story (`stories.md`) is still not announced. The push machinery it
  needs now exists, but nothing calls it — the `TODO(notifications)` in
  `story-digest.processor.ts` stands.
- The reminder can be up to 15 minutes late, and up to 90 after an outage. The
  sweep interval is the resolution; a learner picking 19:07 is served between
  19:07 and 19:22.
- The sweep reads every opted-in learner every 15 minutes and filters in
  application code. Bounded by `reminderEnabled` and having at least one
  subscription, but linear in opted-in learners and run 96 times a day.
- Streak is computed by reading 60 days of that learner's `ReviewLog` and
  bucketing in application code, the same shape as the dashboard. It runs at
  most once per learner per day, but it is not a cheap query for a heavy user.
- **Delivery is not tracked in GA4.** Opt-in, opt-out and click are; the send
  itself happens on the server, which has no Measurement Protocol integration.
  It is logged (`study reminders: N sent, M skipped`) and nothing more.
- A device that has been offline since before the notification expires never
  sees it: the TTL is 12 hours and the collapse tag replaces an unseen reminder
  with the next one rather than stacking a week of them.
- Nothing prunes a subscription that simply goes quiet. Rows are deleted on an
  explicit `404`/`410` or when the learner turns reminders off, and `lastUsedAt`
  is recorded but never swept on.
- **Never verified against a real push service or a real device.** The transport
  was exercised end to end against a local HTTPS server standing in for one —
  real VAPID signing, real `aes128gcm` payload, real `201`/`410`/`503` handling
  — but no notification has been observed arriving on a phone.
- iOS support rests on the learner installing the PWA. The UI explains it; there
  is no install prompt or A2HS coaching flow beyond that sentence.
