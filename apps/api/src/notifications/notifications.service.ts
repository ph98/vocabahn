import { Injectable, Logger } from '@nestjs/common';
import {
  formatReminderTime,
  parseReminderTime,
  type NotificationSettings,
  type PushSubscriptionBody,
  type UpdateNotificationSettingsBody,
} from '@vocabahn/shared';
import { getDateKey, getLocalMidnightInUtc, nextDateKey, prevDateKey } from '../common/date-utils';
import { PrismaService } from '../prisma/prisma.service';
import { REMINDER_STREAK_WINDOW_DAYS } from './notifications.constants';
import type { ReminderStats } from './reminder-copy';
import { PushProvider } from './push.provider';

const DAY_MS = 24 * 60 * 60 * 1000;

/** What the sweep needs to know about one learner before it decides to push. */
export interface ReminderCandidate {
  id: string;
  timezone: string | null;
  reminderHour: number;
  reminderMinute: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushProvider,
  ) {}

  /**
   * Everything the settings UI needs in one response: the learner's preference,
   * whether this deployment can send at all, and the key the browser needs to
   * subscribe. Three separate facts, because the UI has to distinguish them.
   */
  async getSettings(userId: string): Promise<NotificationSettings> {
    const [user, deviceCount] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          reminderEnabled: true,
          reminderHour: true,
          reminderMinute: true,
          timezone: true,
        },
      }),
      this.prisma.pushSubscription.count({ where: { userId } }),
    ]);

    return {
      reminderEnabled: user.reminderEnabled,
      reminderTime: formatReminderTime(user.reminderHour, user.reminderMinute),
      timezone: user.timezone,
      pushConfigured: this.push.enabled,
      vapidPublicKey: this.push.applicationServerKey,
      deviceCount,
    };
  }

  /**
   * Writes the preference. Turning the reminder off **deletes every stored
   * subscription** rather than leaving them to rot: an off switch that only
   * hides the UI while the server still holds a live endpoint is not an off
   * switch, and the learner has no way to check.
   */
  async updateSettings(
    userId: string,
    body: UpdateNotificationSettingsBody,
  ): Promise<NotificationSettings> {
    const data: {
      reminderEnabled?: boolean;
      reminderHour?: number;
      reminderMinute?: number;
      timezone?: string;
    } = {};

    if (body.reminderEnabled !== undefined) data.reminderEnabled = body.reminderEnabled;

    if (body.reminderTime !== undefined) {
      const parsed = parseReminderTime(body.reminderTime);
      // The schema already enforces the shape; this is the belt to its braces.
      if (parsed) {
        data.reminderHour = parsed.hour;
        data.reminderMinute = parsed.minute;
      }
    }

    // A zone Intl cannot parse is dropped rather than rejected: it would only
    // ever arrive from a browser we do not control, and losing the whole save
    // over it would strand the learner's actual preference.
    if (body.timezone !== undefined && isKnownTimeZone(body.timezone)) {
      data.timezone = body.timezone;
    }

    await this.prisma.user.update({ where: { id: userId }, data });

    if (body.reminderEnabled === false) {
      await this.prisma.pushSubscription.deleteMany({ where: { userId } });
    }

    return this.getSettings(userId);
  }

  /**
   * Stores one browser's subscription. The endpoint is the identity, so
   * re-subscribing the same browser updates the row — including moving it to a
   * different account when two people share a device.
   */
  async subscribe(userId: string, body: PushSubscriptionBody): Promise<NotificationSettings> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: body.userAgent ?? null,
      },
      update: {
        userId,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: body.userAgent ?? null,
      },
    });
    return this.getSettings(userId);
  }

  /**
   * Removes one device's subscription, or every device when no endpoint is
   * given. Scoped to the caller: an endpoint is a bearer-ish string and must
   * not let one account delete another's.
   */
  async unsubscribe(userId: string, endpoint?: string): Promise<NotificationSettings> {
    await this.prisma.pushSubscription.deleteMany({
      where: endpoint ? { userId, endpoint } : { userId },
    });
    return this.getSettings(userId);
  }

  /** Learners who have opted in and have at least one device to push to. */
  async listReminderCandidates(): Promise<ReminderCandidate[]> {
    return this.prisma.user.findMany({
      where: { reminderEnabled: true, pushSubscriptions: { some: {} } },
      select: { id: true, timezone: true, reminderHour: true, reminderMinute: true },
    });
  }

  /**
   * The numbers the reminder quotes, for one learner's local day.
   *
   * `dueToday` matches the dashboard's definition — active cards falling due
   * before the learner's local midnight — so the notification and the screen it
   * opens agree.
   */
  async getReminderStats(
    userId: string,
    timeZone: string,
    dateKey: string,
  ): Promise<ReminderStats & { reviewedToday: number }> {
    const dayStartUtc = getLocalMidnightInUtc(dateKey, timeZone);
    const dayEndUtc = getLocalMidnightInUtc(nextDateKey(dateKey), timeZone);

    const [dueToday, reviewedToday, recentLogs] = await Promise.all([
      this.prisma.card.count({
        where: { userId, knownState: 'ACTIVE', due: { lt: dayEndUtc } },
      }),
      this.prisma.reviewLog.count({
        where: { userId, reviewedAt: { gte: dayStartUtc, lt: dayEndUtc } },
      }),
      this.prisma.reviewLog.findMany({
        where: {
          userId,
          reviewedAt: { gte: new Date(dayEndUtc.getTime() - REMINDER_STREAK_WINDOW_DAYS * DAY_MS) },
        },
        select: { reviewedAt: true },
      }),
    ]);

    const reviewedDays = new Set(recentLogs.map((log) => getDateKey(log.reviewedAt, timeZone)));
    return { dueToday, reviewedToday, streak: countStreak(reviewedDays, dateKey) };
  }

  /**
   * Pushes one payload to every device the learner has, pruning the ones the
   * push service reports as dead.
   *
   * Returns how many were accepted. Never throws — a reminder is the least
   * important thing this server does.
   */
  async pushToUser(
    userId: string,
    payload: { title: string; body: string; url: string; tag: string },
  ): Promise<number> {
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });

    const delivered: string[] = [];
    const dead: string[] = [];

    for (const subscription of subscriptions) {
      const result = await this.push.send(subscription, payload);
      if (result === 'sent') delivered.push(subscription.id);
      else if (result === 'gone') dead.push(subscription.id);
    }

    if (dead.length > 0) {
      await this.prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
      this.logger.log(`pruned ${dead.length} dead subscription(s) for ${userId}`);
    }
    if (delivered.length > 0) {
      await this.prisma.pushSubscription.updateMany({
        where: { id: { in: delivered } },
        data: { lastUsedAt: new Date() },
      });
    }

    return delivered.length;
  }
}

/**
 * Consecutive local days ending at `todayKey`, or at the day before it when
 * today has no reviews yet. Same rule as the dashboard's streak, so the number
 * in the notification is the number on the screen it opens.
 */
export function countStreak(reviewedDays: ReadonlySet<string>, todayKey: string): number {
  let cursor = todayKey;
  if (!reviewedDays.has(cursor)) cursor = prevDateKey(cursor);

  let streak = 0;
  while (reviewedDays.has(cursor)) {
    streak += 1;
    cursor = prevDateKey(cursor);
  }
  return streak;
}

/** Whether Intl recognises the zone, which is the only validation worth doing. */
export function isKnownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
