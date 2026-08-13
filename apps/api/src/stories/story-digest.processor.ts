import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { getDateKey } from '../common/date-utils';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { isDigestHour } from './digest-schedule';
import {
  STORY_DIGEST_ACTIVE_DAYS,
  STORY_DIGEST_QUEUE,
  type StoryDigestJobData,
} from './stories.constants';
import { StoriesService } from './stories.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Writes each learner one story a day, timed to their own morning, so the app
 * has something waiting rather than a button to press and a wait to sit through.
 *
 * The job wakes hourly and generates for whichever learners have just reached
 * their digest hour. Concurrency 1 — this is a sweep, and two sweeps racing on
 * the same hour would only contend on the same Redis guards.
 */
@Injectable()
@Processor(STORY_DIGEST_QUEUE, { concurrency: 1 })
export class StoryDigestProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(StoryDigestProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stories: StoriesService,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(STORY_DIGEST_QUEUE) private readonly queue: Queue<StoryDigestJobData>,
  ) {
    super();
  }

  /**
   * One repeatable job at the top of every hour. The fixed `jobId` keeps this
   * idempotent across restarts and across API replicas — every replica calls
   * this on boot, and BullMQ keeps a single scheduler per key.
   */
  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'sweep',
      {},
      {
        jobId: 'story-digest-repeat',
        repeat: { pattern: '0 * * * *' },
        removeOnComplete: true,
        removeOnFail: { count: 20 },
      },
    );
  }

  async process(): Promise<void> {
    const now = new Date();

    // Bounded to learners who could actually use a story: they have words to
    // build one from, and they have reviewed something recently. Generating for
    // dormant accounts spends a paid model call on nobody.
    const candidates = await this.prisma.user.findMany({
      where: {
        cards: { some: { knownState: 'ACTIVE' } },
        reviewLogs: { some: { reviewedAt: { gte: new Date(Date.now() - STORY_DIGEST_ACTIVE_DAYS * DAY_MS) } } },
      },
      select: { id: true, timezone: true },
    });

    const due = candidates.filter((user) => isDigestHour(now, user.timezone));
    if (due.length === 0) return;

    let created = 0;
    for (const user of due) {
      try {
        if (!(await this.claimToday(user.id, user.timezone))) continue;
        await this.stories.create(user.id, user.timezone ?? 'UTC', undefined, 'DAILY');
        created += 1;

        // TODO(notifications): the whole point of writing this at 07:00 local is
        // that the learner is told it exists. Until push notifications land,
        // they only find it by opening the app, where GET /stories/latest
        // surfaces it. When notifications ship, send here — after the row is
        // created, and carrying the story id so the notification deep-links to
        // it. Note the story is still PENDING at this point; either wait for
        // READY or word the notification so it survives a story that fails.
      } catch (err) {
        // One learner's failure — no words, a provider outage — must not stop
        // the sweep for everyone whose morning it also is.
        this.logger.warn(
          `daily story for ${user.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (created > 0) {
      this.logger.log(`daily stories: ${created} written for ${due.length} learners due`);
    }
  }

  /**
   * Claims this learner's slot for their local day. `SET NX` is the whole
   * guard: whichever replica gets there first generates, and a sweep that runs
   * twice in an hour — a retry, a redeploy — writes one story, not two.
   */
  private async claimToday(userId: string, timeZone: string | null): Promise<boolean> {
    const key = `story:daily:${userId}:${getDateKey(new Date(), timeZone ?? 'UTC')}`;
    // 36h, comfortably past the local day without pinning keys around forever.
    const claimed = await this.redis.set(key, '1', 'EX', 129_600, 'NX');
    return claimed === 'OK';
  }
}
