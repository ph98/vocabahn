# Analytics

What the web client sends to Google Analytics 4, when, and with which
parameters — and, at the end, the one other third party that runs in the
browser: the product feedback widget. Present tense: every event in the table
below has a call site in `apps/web/src`. Names declared in code but not yet sent
are listed separately, under **Reserved names**, and are not part of the table.

Code: `apps/web/src/lib/analytics-events.ts` (the taxonomy),
`apps/web/src/lib/telemetry.ts` (consent, transport, redaction),
`apps/web/src/lib/feedback-widget.ts` (the Usersnap adapter),
`apps/web/src/components/ProductFeedbackTrigger.tsx`,
`apps/web/src/components/CookieConsentBanner.tsx`,
`apps/web/src/components/PrivacyPage.tsx`.

## How it is enforced

`analytics-events.ts` exports `AnalyticsEventMap`, a map from event name to the
exact parameter type that event carries. `trackEvent` is generic over that map:

```ts
export function trackEvent<K extends AnalyticsEventName>(
  eventName: K,
  ...args: AnalyticsEventArgs<K>
)
```

So an unknown name, a missing parameter, a misspelt parameter or a wrong type
is a **compile error**, not a silently divergent event in the GA4 property.
`AnalyticsEventArgs` makes the parameter argument optional exactly for the
events declared with no parameters of their own, and required for the rest.

`apps/web/src/components/__tests__/telemetry.test.ts` carries a block of
`@ts-expect-error` assertions — including the two payload shapes
`custom_word_added` used to be fired with — so `tsc --noEmit` fails if the map
ever stops rejecting them.

Adding an event is three steps, in order:

1. Add it to `AnalyticsEventMap` with its parameter type.
2. Add a row to the table below.
3. Register any new parameter as a **custom dimension** in the GA4 property
   admin. Until that is done the parameter is visible in DebugView and Realtime
   and nowhere else — it cannot be used in a report, an audience or an
   exploration.

## Consent

Nothing reaches GA4 without both gates in `telemetry.ts`:

- `isAnalyticsEnabled()` — false in development, in tests, and on `localhost` /
  `127.0.0.1`.
- `getStoredConsent() === 'granted'` — the visitor actively accepted, via the
  cookie banner or the toggle on `/privacy`.

`isAnalyticsAllowed()` is both, and `trackEvent`, `trackPageView`,
`markPendingLogin` and `isFirstReviewSession` all return early on it. The GA4
script itself is not injected until consent is granted (`initGA4`), and Consent
Mode v2 defaults `analytics_storage` to `denied` before that
(`initTelemetry`). Advertising signals — `ad_storage`, `ad_user_data`,
`ad_personalization` — are hard-coded `denied` and are never asked for.

The two analytics-only browser storage keys are written **only** while consent
is granted, so declining leaves no analytics footprint at all:

| Key | Storage | Purpose |
| :--- | :--- | :--- |
| `vocabahn_pending_login` | session | Survives the full-page redirect of a Google / magic-link sign-in so the returning load can report `login` once. |
| `vocabahn_first_review_done` | local | Stops `first_review_complete` firing twice on the same device. |

## What is deliberately not sent

**Headwords do not go to Google.** The vocabulary a person chooses to study is
behavioural data about that person — it discloses their job, their health, what
they are travelling for. The decision is that GA4 gets the *shape* of the
behaviour and never its content:

- `dictionary_search` sends `term_length`, not the term.
- `word_view` sends `enrichment_status`, not the word.
- `story_generate` / `story_complete` send the topic **slug**, which comes from
  the fixed `STORY_TOPICS` taxonomy in `packages/shared` — a closed set of
  subject categories, not learner-authored text.
- `page_path` and `page_location` are redacted before they are sent:
  `/word/Haus` becomes `/word/:word` and `/decks/<cuid>` becomes `/decks/:id`.
  This matters more than it looks: gtag reads `window.location.href` itself and
  attaches it to **every** hit, so without `redactPagePath` and the
  `gtag('set', …)` in `trackPageView` the headword — and the `?q=` search term
  on `/dictionary` — would ride along on every event regardless of what the
  event's own parameters said. Course slugs are left intact; they name public
  catalogue content, not the learner.

Also never sent: email, account id, deck id, dictionary entry id, story id,
display name, avatar URL, or any free-text field. Where an identifier would
have been useful it is replaced by a category — `review_session_complete` sends
`session_scope: 'deck'` rather than which deck.

## Volume

GA4 allows 25 parameters per event and meters events per property, and the
review loop is by far the highest-frequency thing in the app. **No event fires
per card.** A 50-card session sends exactly one `review_session_complete`,
whose per-rating counts carry everything a per-card event would have, plus
`offline_queued_count` in place of a per-card "queued offline" event.
`ReviewSession.tsx` keeps those running totals in a ref specifically so the
summary can be assembled once, at the end.

`dictionary_search` fires once per *settled* search — the query is debounced by
250 ms and a ref stops a re-render or a cache hit re-reporting the same term.
`word_view` lives in `EntryDetail`, not `EntryBody`, because `EntryBody` is
also what a review session renders behind each revealed card; putting it there
would have made it a per-card event by accident.

## Events

### Acquisition

| Event | Fires when | Parameters |
| :--- | :--- | :--- |
| `landing_cta_click` | A signed-out visitor clicks **Sign in with Google**, or submits the magic-link form. | `cta`: `google` \| `email_magic_link` |
| `login` | A session actually exists. One Tap reports it on mutation success; the two redirect flows report it on the load that returns (see the marker key above). | `method`: `google` \| `google_one_tap` \| `email_link` |

### Activation

| Event | Fires when | Parameters |
| :--- | :--- | :--- |
| `course_start` | Enrolling in a CEFR course succeeds — the moment cards first exist. | `course_slug`: string · `cefr_level`: string \| null |
| `cefr_level_calibrate` | A self-reported CEFR level is saved from the calibration card. | `cefr_level`: string (a sub-level, `A1.1` … `C2.2`) |
| `known_words_bulk_mark` | Suggested words are bulk-marked as already known. | `word_count`: number |
| `first_review_complete` | The first review session ever finished in this browser. Sent *in addition to* `review_session_complete`, never instead of it. | `card_count`: number |

### Core loop

| Event | Fires when | Parameters |
| :--- | :--- | :--- |
| `review_session_complete` | The session summary is reached. Once per session — undoing from the summary and re-rating does not send a second one; **Review more** does, because that is a new session. | `card_count` · `again_count` · `hard_count` · `good_count` · `easy_count` · `accuracy_pct` (0–100) · `duration_sec` · `offline_queued_count` · `session_scope`: `all` \| `course` \| `deck` |
| `review_session_abandon` | The review route unmounts with at least one card rated and the summary never reached. | `card_count` · `remaining_count` · `session_scope` |

### Content

| Event | Fires when | Parameters |
| :--- | :--- | :--- |
| `dictionary_search` | A debounced search of ≥ 2 characters returns results. | `term_length`: number · `result_count`: number |
| `word_view` | A dictionary entry page renders an entry, once per word. | `enrichment_status`: the `EnrichmentStatus` enum |
| `deck_create` | A user deck is created. | `is_public`: boolean |
| `custom_word_added` | Words are added to a user deck, from **either** path. | `source`: `entry_page` \| `deck_import` · `word_count`: number |
| `story_generate` | A micro-story request is accepted. | `topic`: `STORY_TOPICS` slug or `none` · `sourced`: boolean |
| `story_generate_failed` | A micro-story request is refused or errors. | `reason`: `no_words` \| `quota_exhausted` \| `error` |
| `story_complete` | A micro-story is marked finished. | `target_count` · `not_understood_count` · `topic` |

### Retention and performance

| Event | Fires when | Parameters |
| :--- | :--- | :--- |
| `pwa_install` | The browser fires `appinstalled`. | — |
| `web_vitals` | Each of LCP, INP, CLS, FCP, TTFB reports. CLS is scaled ×1000 to stay an integer. | `metric_name` · `metric_value` · `metric_rating` |

### Product feedback

| Event | Fires when | Parameters |
| :--- | :--- | :--- |
| `product_feedback_open` | The Usersnap dialog actually opened — from the widget's own `open` event, not from the click, so a widget that failed to load is not counted. | — |
| `product_feedback_submit` | A report was submitted. | — |

`page_view` is also sent manually on every SPA route change (GA4's automatic
one is switched off with `send_page_view: false`), carrying the redacted
`page_path`, `page_location` and `page_title`.

## Reserved names

Declared in `AnalyticsEventMap` so the features that will send them do not have
to reopen the taxonomy, and so their shapes are agreed once. **These have no
call site**, and must not be added to the tables above until they do.

| Name | For | Parameters |
| :--- | :--- | :--- |
| `notification_opt_in` | #74 | `permission`: `granted` \| `denied` \| `default` |
| `notification_opt_out` | #74 | — |
| `notification_click` | #74 | `notification_type`: `daily_reminder` |

`notification_click` is declared as a client event on purpose: a service worker
has no `window.gtag`, so the `notificationclick` handler has to open the app
and let the resulting load report it.

## Custom dimensions to register

Parameters are not queryable in GA4 until they are registered in
**Admin → Custom definitions**. Every parameter below is event-scoped and text,
except where marked. Numeric parameters can be registered as custom *metrics*
instead when they are to be summed or averaged; the ones marked **metric** are
the ones worth that.

| Parameter | Scope | Type | Used by |
| :--- | :--- | :--- | :--- |
| `cta` | event | text | `landing_cta_click` |
| `method` | event | text | `login` (GA4 reports this natively for `login`; registering it makes it available in explorations) |
| `course_slug` | event | text | `course_start` |
| `cefr_level` | event | text | `course_start`, `cefr_level_calibrate` |
| `word_count` | event | number (**metric**) | `known_words_bulk_mark`, `custom_word_added` |
| `card_count` | event | number (**metric**) | `review_session_complete`, `review_session_abandon`, `first_review_complete` |
| `again_count` · `hard_count` · `good_count` · `easy_count` | event | number (**metric**) | `review_session_complete` |
| `accuracy_pct` | event | number (**metric**) | `review_session_complete` |
| `duration_sec` | event | number (**metric**) | `review_session_complete` |
| `offline_queued_count` | event | number (**metric**) | `review_session_complete` |
| `remaining_count` | event | number (**metric**) | `review_session_abandon` |
| `session_scope` | event | text | `review_session_complete`, `review_session_abandon` |
| `term_length` | event | number (**metric**) | `dictionary_search` |
| `result_count` | event | number (**metric**) | `dictionary_search` |
| `enrichment_status` | event | text | `word_view` |
| `is_public` | event | text | `deck_create` |
| `source` | event | text | `custom_word_added` |
| `topic` | event | text | `story_generate`, `story_complete` |
| `sourced` | event | text | `story_generate` |
| `reason` | event | text | `story_generate_failed` |
| `target_count` · `not_understood_count` | event | number (**metric**) | `story_complete` |
| `metric_name` · `metric_rating` | event | text | `web_vitals` |
| `metric_value` | event | number (**metric**) | `web_vitals` |

No **user-scoped** dimension is registered, and none should be: a user-scoped
dimension is a property of the person, which is exactly the category this
taxonomy keeps out of GA4.

## Product feedback widget

A floating **Feedback** button, bottom-right, opening
[Usersnap](https://usersnap.com)'s screenshot-annotated feedback dialog. It is
the only way a learner can say *"this flow confused me"* — `EntryFeedback` on a
dictionary card only covers *"this entry is wrong"*.

`lib/feedback-widget.ts` is the whole of the vendor surface: it owns the script
tag, the `window` callback and the vendor API shape, and exposes four functions
(`isFeedbackWidgetConfigured`, `loadFeedbackWidget`, `openFeedbackWidget`,
`unloadFeedbackWidget`). `components/ProductFeedbackTrigger.tsx` is its only
caller, and the only place the load conditions live.

### When it loads

Four conditions, all required, checked before any network request:

| Condition | Why |
| :--- | :--- |
| `VITE_USERSNAP_API_KEY` is set | Unset is a normal state: no trigger, no script, no error, no console output. Development and any deployment without a key behave identically to before. |
| `isAnalyticsEnabled()` **and** consent is `granted` | The same gate GA4 goes through. Withdrawing consent calls `unloadFeedbackWidget`, which runs the vendor's `destroy()` and removes the script — hiding the button would not be withdrawal. |
| Someone is signed in | The goal is feedback from users. It also keeps the landing page free of a third-party connection, which is what #71 is cutting. |
| The route is not `/review` | A floating button mid-session is a distraction. `/review` already suppresses the edge-swipe gesture for the same reason. |

The script is fetched inside `requestIdleCallback` (1.2 s `setTimeout`
fallback), so it never competes with the first render. A click that lands
before it arrives is remembered and honoured once it does, rather than dropped.
The trigger opens the dialog through a Usersnap **API event**
(`vocabahn_product_feedback`); the vendor's own button is switched off in the
project's audience settings, which is what makes the trigger's placement,
keyboard path and accessible name the app's to control.

### What a report carries

Set on the widget's `open` event rather than at `init`, so the route is the one
being complained about and not the one the page was loaded on:

| Field | Value |
| :--- | :--- |
| `route` | `redactPagePath(pathname)` — `/word/Haus` is reported as `/word/:word`, exactly as for GA4. |
| `app_version` | `__APP_VERSION__`, the string the footer links to the changelog with. |
| `viewport` | `"375x812"` — tells a narrow-layout bug from a wide one. |
| `signed_in` | Always `true` today, since the trigger does not mount otherwise. |

No account id, no email, no `user` block. `collectGeoLocation: 'none'` is passed
at init, so Usersnap does not geolocate the reporter's IP.

Usersnap's own script does record the page address and takes the screenshot the
person is shown before sending, and on `/word/:word` both of those contain the
headword. That is not a leak of the kind `redactPagePath` exists to prevent: it
happens only on a deliberate submit, only after consent, and the reporter sees
the screenshot before it is sent. `PrivacyPage.tsx` §4 says so in as many words.

### Why Usersnap

Weighed against the alternatives in #80:

- **Not Hotjar.** Hotjar's value is session recording and heatmaps, and that is
  also its cost. Recording captures the sign-in email field and every free-text
  input, needing masking configured per field and defended forever; under GDPR
  it is a materially different category from page analytics, so it would not
  have been honest to ride it in on this app's single binary consent bucket. It
  is also the heaviest script of the candidates, against an app actively cutting
  bundle weight.
- **Not Canny or Featurebase.** Feature-request boards and voting are a
  different job from *"this is broken"*, which is the gap being filled.
- **Not self-hosted.** The tempting one: `EntryFeedback` plus Directus is the
  same shape, and it avoids the consent and weight questions entirely. It was
  rejected on what the report is *worth*, not on what it costs to build. A
  free-text box yields "the review page is broken"; the screenshot, the
  annotation on it, and the automatic browser/console context are what make a
  report actionable without a round of follow-up questions — and reimplementing
  DOM capture and annotation is a project, not an endpoint. The endpoint remains
  the fallback if the widget is ever removed.

**Because there is no session recording, §2 of #80 — input masking — does not
apply.** Nothing is captured in the background at all: the sign-in email field
and every free-text input are only ever seen by Usersnap if the person
deliberately opens the dialog while they are on screen, and then only in a
screenshot they are shown before sending.

## Limitations

- **The custom dimensions above are not registered** (#75). Registering them
  needs access to the GA4 property admin, which the codebase does not have.
  Until that is done every parameter here is visible only in DebugView and the
  Realtime report.
- **No event has been confirmed in DebugView** (#75), for the same reason. The
  shapes are guaranteed by the type system and by the unit tests, not by an
  observed hit.
- **`sign_up` does not exist.** Distinguishing a new account from a returning
  one is only knowable server-side, and both Google OAuth and the magic link
  complete through a full-page redirect. Adding it means the API telling the
  client — for example a `signed_in`/`new_user` query parameter on the redirect
  in `auth.controller.ts`, mirroring the `auth_error` parameter already there.
  Until then, new-account counts come from `User.createdAt`, exactly, rather
  than from GA4 approximately.
- **`login` reporting depends on `sessionStorage`.** A magic link opened in a
  browser that blocks session storage, or a sign-in whose redirect lands in a
  different tab, is not reported. One Tap is unaffected.
- **`first_review_complete` is device-scoped, not account-scoped.** The API
  exposes no lifetime review count, so the marker is a `localStorage` key; the
  same learner's first session on a second device sends it again. GA4's own
  attribution is cookie-scoped anyway.
- **`enrichment_quota_exhausted` is not implemented.** The API refuses an
  over-quota enrichment silently — `EnrichmentService.requestEnrichment` logs a
  warning and returns, and the entry comes back unenriched with no indication
  why. A client-side event would be inferred from the polled `/dictionary/quota`
  counter and would fire once per profile-page view rather than once per
  refusal. It needs the refusal surfaced in the entry response first.
- **`card_rated` and `streak_milestone` were considered and rejected.**
  `card_rated` is the per-card event this taxonomy exists to prevent; its
  content is entirely carried by `review_session_complete`. `streak_milestone`
  would have to fire from a dashboard render, making it an artifact of render
  timing, and the streak is already stored exactly in Postgres where it can be
  counted rather than sampled.
- **`review_session_abandon` misses tab closes.** It is an unmount cleanup, so
  navigating away inside the SPA reports it but closing the tab does not. GA4's
  own session timeout is the fallback signal there.
- The counts on `review_session_complete` are those at the moment the summary
  was first reached. An undo taken *from* the summary corrects the UI but does
  not amend the event already sent.
- **The feedback widget has never been loaded.** `VITE_USERSNAP_API_KEY` is
  unset everywhere, so no Usersnap account, project, or API-event trigger
  exists yet (#80). Everything above the network boundary is covered by tests
  in `components/__tests__/ProductFeedbackTrigger.test.tsx`; the vendor half —
  that `logEvent('vocabahn_product_feedback')` opens the dialog, that the
  default button is really suppressed, that `setValue('custom', …)` shows up on
  the report — is read from Usersnap's API reference and has not been observed.
- **Consent changes are watched in this tab only.** `subscribeConsent` notifies
  in-process listeners, so the trigger appears the instant the banner is
  accepted; a second tab picks the change up on its next load.
- **A stack of two or more toasts can reach the feedback trigger at 375 px.**
  While a toast is on screen the trigger steps up by
  `--vb-feedback-toast-clearance`, which is sized for the taller of the two
  toast shapes (5.5 rem against an 80 px two-line toast); the toast region
  allows three at once. Two simultaneous toasts is not a state the app produces
  today — the only producer, `useSettings`, dedupes by key.
