import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module';
import {
  REMINDER_CATCH_UP_MINUTES,
  REMINDER_CLAIM_TTL_SECONDS,
  REMINDER_QUEUE,
  REMINDER_SWEEP_CRON,
  REMINDER_TAG,
  REMINDER_TARGET_PATH,
  type ReminderJobData,
} from './notifications.constants';
import { NotificationsService, type ReminderCandidate } from './notifications.service';
import { PushProvider } from './push.provider';
import { buildReminderMessage } from './reminder-copy';
import { reminderSlot } from './reminder-schedule';

/**
 * Sends each opted-in learner one study reminder a day, at the time they chose,
 * in their own timezone.
 *
 * Structurally this is the daily-story sweep (`stories/story-digest.processor`)
 * with a different payload: a repeatable BullMQ job with a fixed id so N API
 * replicas produce one sweep, a pure clock-injected function deciding whose
 * moment it is, and a Redis `SET NX` on the learner's **local** date claiming
 * the send. Concurrency 1 — two sweeps racing would only contend on the same
 * guards.
 */
@Injectable()
@Processor(REMINDER_QUEUE, { concurrency: 1 })
export class ReminderProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly push: PushProvider,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(REMINDER_QUEUE) private readonly queue: Queue<ReminderJobData>,
  ) {
    super();
  }

  /**
   * One repeatable job. The fixed `jobId` keeps it idempotent across restarts
   * and replicas — every replica calls this on boot, and BullMQ keeps a single
   * scheduler per key.
   *
   * Registered even with VAPID unset: `process` exits immediately in that case,
   * and a deployment that later gains keys should not need a queue migration.
   */
  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'sweep',
      {},
      {
        jobId: 'study-reminder-repeat',
        repeat: { pattern: REMINDER_SWEEP_CRON },
        removeOnComplete: true,
        removeOnFail: { count: 20 },
      },
    );
  }

  async process(): Promise<void> {
    if (!this.push.enabled) return;

    const now = new Date();
    const candidates = await this.notifications.listReminderCandidates();

    let sent = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      try {
        const outcome = await this.sendIfDue(candidate, now);
        if (outcome === 'sent') sent += 1;
        else if (outcome === 'skipped') skipped += 1;
      } catch (err) {
        // One learner's failure must not stop the sweep for everyone whose
        // moment it also is. Delivery is best-effort by design.
        this.logger.warn(
          `reminder for ${candidate.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (sent > 0 || skipped > 0) {
      this.logger.log(`study reminders: ${sent} sent, ${skipped} skipped`);
    }
  }

  /**
   * `'sent'` when a push was accepted by at least one device, `'skipped'` when
   * the learner's slot was claimed but there was nothing worth saying, and
   * `'not-due'` when this is not their moment.
   */
  private async sendIfDue(
    candidate: ReminderCandidate,
    now: Date,
  ): Promise<'sent' | 'skipped' | 'not-due'> {
    const dateKey = reminderSlot(
      now,
      candidate.timezone,
      candidate.reminderHour,
      candidate.reminderMinute,
      REMINDER_CATCH_UP_MINUTES,
    );
    if (!dateKey) return 'not-due';

    // Claim before deciding what to say. The claim is what makes this
    // once-per-local-day; taking it first also means the stats queries below
    // run once a day per learner rather than once per sweep tick.
    if (!(await this.claim(candidate.id, dateKey))) return 'not-due';

    const timeZone = candidate.timezone || 'UTC';
    const stats = await this.notifications.getReminderStats(candidate.id, timeZone, dateKey);

    // Nothing is more annoying than being nagged for something you already did,
    // and "0 cards due today" is not a reason to open anything.
    if (stats.reviewedToday > 0 || stats.dueToday === 0) return 'skipped';

    const message = buildReminderMessage(stats);
    const delivered = await this.notifications.pushToUser(candidate.id, {
      ...message,
      url: REMINDER_TARGET_PATH,
      tag: REMINDER_TAG,
    });

    return delivered > 0 ? 'sent' : 'skipped';
  }

  /**
   * Claims this learner's slot for the local day the reminder belongs to.
   * Whichever replica gets there first sends; a sweep that runs twice inside
   * one window sends once.
   */
  private async claim(userId: string, dateKey: string): Promise<boolean> {
    const claimed = await this.redis.set(
      `reminder:daily:${userId}:${dateKey}`,
      '1',
      'EX',
      REMINDER_CLAIM_TTL_SECONDS,
      'NX',
    );
    return claimed === 'OK';
  }
}
