import type { EnrichmentStatus } from '@vocabahn/shared';

/**
 * The GA4 event taxonomy: every event name this app may send, mapped to the
 * exact parameters it carries. `trackEvent` in `./telemetry` is typed against
 * this map, so an unknown event name or a wrong parameter shape is a compile
 * error rather than a silent inconsistency in the GA4 property.
 *
 * Rules this map exists to enforce:
 *
 * - **One name, one shape.** GA4 merges same-named events from different call
 *   sites into a single event with whichever parameters happened to arrive.
 * - **No PII.** No email, no user id, no free text, no headword, no opaque
 *   object id. Every parameter here is a count, an enum, or a duration. See
 *   `docs/system/analytics.md` for the headword decision in particular.
 * - **No per-interaction events.** Anything that happens once per card, per
 *   keystroke or per scroll is aggregated into a session-level summary
 *   instead. A 50-card review session sends one event, not fifty.
 *
 * Adding an event means three steps, in order: add it here, add a row to the
 * table in `docs/system/analytics.md`, and register any new parameter as a
 * custom dimension in the GA4 property (parameters are not queryable until
 * that is done).
 */
export type AnalyticsEventMap = {
  // ── Acquisition ───────────────────────────────────────────────────────────

  /** A signed-out visitor started a sign-in flow. The last thing the SPA sees
   *  before the redirect-based flows leave the page. */
  landing_cta_click: { cta: SignInCta };

  /** A session was actually established. GA4 recommended event. */
  login: { method: LoginMethod };

  // ── Activation ────────────────────────────────────────────────────────────

  /** Enrolled in a CEFR course, which is what creates the first cards. */
  course_start: { course_slug: string; cefr_level: string | null };

  /** Self-reported CEFR level saved from the calibration card. */
  cefr_level_calibrate: { cefr_level: string };

  /** Bulk-marked suggested words as already known from the known-words page. */
  known_words_bulk_mark: { word_count: number };

  /** The first review session ever completed in this browser. Fires alongside
   *  `review_session_complete`, never instead of it. */
  first_review_complete: { card_count: number };

  // ── Core loop ─────────────────────────────────────────────────────────────

  /**
   * One review session, summarised. This is the aggregation point: the
   * per-rating counts here replace any notion of a per-card event, and
   * `offline_queued_count` replaces a per-card "queued offline" event.
   */
  review_session_complete: {
    card_count: number;
    again_count: number;
    hard_count: number;
    good_count: number;
    easy_count: number;
    /** Percentage of ratings that were Good or Easy, 0–100. */
    accuracy_pct: number;
    duration_sec: number;
    /** Ratings that could not reach the server and went to the offline queue. */
    offline_queued_count: number;
    session_scope: ReviewScope;
  };

  /** The learner left a review session with cards rated but not finished. */
  review_session_abandon: {
    card_count: number;
    remaining_count: number;
    session_scope: ReviewScope;
  };

  // ── Content ───────────────────────────────────────────────────────────────

  /** A settled dictionary search. The term itself is deliberately not sent. */
  dictionary_search: { term_length: number; result_count: number };

  /** A dictionary entry page was opened. Not sent for cards revealed during a
   *  review session — that would be a per-card event. */
  word_view: { enrichment_status: EnrichmentStatus };

  /** A user deck was created. */
  deck_create: { is_public: boolean };

  /** Words were added to a user deck, from either of the two paths that can do
   *  it. `word_count` is 1 from an entry page and the imported count from the
   *  bulk import dialog. */
  custom_word_added: { source: CustomWordSource; word_count: number };

  /** A micro-story was requested and accepted for generation. */
  story_generate: { topic: string; sourced: boolean };

  /** A micro-story request was refused or failed. */
  story_generate_failed: { reason: StoryFailureReason };

  /** A micro-story was marked finished. */
  story_complete: { target_count: number; not_understood_count: number; topic: string };

  // ── Retention ─────────────────────────────────────────────────────────────

  /** The browser reported the PWA was installed to the home screen. */
  pwa_install: NoEventParams;

  // ── Performance ───────────────────────────────────────────────────────────

  /** One Core Web Vitals metric. CLS is scaled by 1000 to stay an integer. */
  web_vitals: { metric_name: string; metric_value: number; metric_rating: string };

  // ── Reserved ──────────────────────────────────────────────────────────────
  //
  // Declared here so the features that will send them do not have to reopen
  // the taxonomy, and so their shapes are agreed once. **These have no call
  // site yet** — they are the extension point, not a claim about what the app
  // currently sends. `docs/system/analytics.md` lists them separately from the
  // events that actually fire, and they must not be added to that table until
  // a call site exists.

  /** Reserved for #74 (daily study reminders). Fires after the browser
   *  permission prompt resolves, carrying its outcome. */
  notification_opt_in: { permission: NotificationPermissionOutcome };

  /** Reserved for #74. Fires when the reminder setting is switched off. */
  notification_opt_out: NoEventParams;

  /** Reserved for #74. A service worker cannot call gtag, so this is expected
   *  to fire from the client on the load the notification opened. */
  notification_click: { notification_type: 'daily_reminder' };

  /** Reserved for #80 (product feedback widget). Route and app version are
   *  already on every hit, so neither belongs in the parameters. */
  product_feedback_open: NoEventParams;

  /** Reserved for #80. */
  product_feedback_submit: NoEventParams;
};

/** An event that carries no parameters of its own. */
export type NoEventParams = Record<never, never>;

/** Sign-in entry points a signed-out visitor can click. */
export type SignInCta = 'google' | 'email_magic_link';

/**
 * How a session was established. `google` and `email_link` complete through a
 * full-page redirect, so they are reported on the load that returns.
 */
export type LoginMethod = 'google' | 'google_one_tap' | 'email_link';

/** Which subset of cards a review session was started against. */
export type ReviewScope = 'all' | 'course' | 'deck';

/** The two paths that add a word to a user deck. */
export type CustomWordSource = 'entry_page' | 'deck_import';

/** Why a story could not be generated, as the client can observe it. */
export type StoryFailureReason = 'no_words' | 'quota_exhausted' | 'error';

/** Outcome of the browser's notification permission prompt. */
export type NotificationPermissionOutcome = 'granted' | 'denied' | 'default';

export type AnalyticsEventName = keyof AnalyticsEventMap;

export type AnalyticsEventParams<K extends AnalyticsEventName> = AnalyticsEventMap[K];

/**
 * Makes the parameters argument optional for events declared `NoEventParams`
 * and required for every other event.
 */
export type AnalyticsEventArgs<K extends AnalyticsEventName> =
  keyof AnalyticsEventParams<K> extends never
    ? [params?: AnalyticsEventParams<K>]
    : [params: AnalyticsEventParams<K>];
