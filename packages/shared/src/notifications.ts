import { z } from 'zod';

/**
 * The daily study reminder: the first genuinely server-backed user setting.
 *
 * It has to be server-backed because the sender is the server. A `localStorage`
 * flag — which is what every other setting is — cannot stop a push that is
 * decided in a BullMQ sweep, so "off" would be a lie the moment the learner
 * cleared their browser storage.
 */

/** Learner-local wall-clock time, `HH:mm` on a 24-hour clock. */
export const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const reminderTimeSchema = z
  .string()
  .regex(REMINDER_TIME_PATTERN, 'Expected a local time as HH:mm');

/**
 * What the client needs to render the whole reminder control, in one response.
 *
 * The three "can this work at all" facts are deliberately separate from the
 * learner's preference, because they answer different questions and the UI has
 * to distinguish them: `reminderEnabled` is what the learner asked for,
 * `pushConfigured` is whether this deployment can send anything, and the
 * browser permission is a third state the server never sees.
 */
export const notificationSettingsSchema = z.object({
  /** The learner's preference. False for everyone until they opt in. */
  reminderEnabled: z.boolean(),
  /** Learner-local time the reminder is aimed at, `HH:mm`. */
  reminderTime: reminderTimeSchema,
  /** IANA zone the reminder time is interpreted in; null until a client sends one. */
  timezone: z.string().nullable(),
  /** Whether VAPID keys are configured. False means this deployment cannot send. */
  pushConfigured: z.boolean(),
  /** VAPID public key for `PushManager.subscribe`; null when unconfigured. */
  vapidPublicKey: z.string().nullable(),
  /** How many devices currently hold a live subscription. */
  deviceCount: z.number().int().min(0),
});

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const updateNotificationSettingsSchema = z.object({
  reminderEnabled: z.boolean().optional(),
  reminderTime: reminderTimeSchema.optional(),
  /**
   * The browser's own `Intl` zone. Sent with every settings write rather than
   * asked for, because a learner who moves should not have to remember to tell
   * us; an unparseable value is dropped server-side rather than rejected.
   */
  timezone: z.string().min(1).max(64).optional(),
});

export type UpdateNotificationSettingsBody = z.infer<typeof updateNotificationSettingsSchema>;

/**
 * A `PushSubscription` as `PushSubscription.toJSON()` produces it, which is the
 * shape `web-push` expects on the way back out.
 */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
  /** Best-effort device label, so a learner can tell two rows apart. */
  userAgent: z.string().max(255).optional(),
});

export type PushSubscriptionBody = z.infer<typeof pushSubscriptionSchema>;

export const unsubscribeSchema = z
  .object({
    /** Omitted means "every device": what the settings toggle sends when turned off. */
    endpoint: z.string().url().max(2048).optional(),
  })
  // A DELETE may legitimately carry no body at all, and Express hands that
  // through as `undefined` rather than `{}`.
  .default({});

export type UnsubscribeBody = z.infer<typeof unsubscribeSchema>;

/**
 * The JSON a push carries. The service worker is hand-written vanilla JS and
 * cannot import this type, so it is duplicated there as a comment — keep both
 * in step.
 */
export const pushPayloadSchema = z.object({
  title: z.string(),
  body: z.string(),
  /** Path the notification opens, relative to the app origin. */
  url: z.string(),
  /** Collapse key: a second reminder replaces the first rather than stacking. */
  tag: z.string(),
});

export type PushPayload = z.infer<typeof pushPayloadSchema>;

/** `"19:00"` → `{ hour: 19, minute: 0 }`; null when the string is not `HH:mm`. */
export function parseReminderTime(value: string): { hour: number; minute: number } | null {
  const match = REMINDER_TIME_PATTERN.exec(value);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/** `{ hour: 19, minute: 0 }` → `"19:00"`. */
export function formatReminderTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
