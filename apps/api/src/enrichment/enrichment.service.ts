import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module';
import { ENRICHMENT_QUEUE, type EnrichmentJobData } from './enrichment.constants';

// Per-user/day cap on new-word enrichments that trigger paid APIs (abuse control).
const DAILY_CAP = Number(process.env.ENRICHMENT_DAILY_CAP ?? 50);

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(
    @InjectQueue(ENRICHMENT_QUEUE)
    private readonly queue: Queue<EnrichmentJobData>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Lazily enqueue enrichment for a word a user just opened. The 10k
   * promoted entries are never bulk-enriched — paid APIs fire only on access.
   * Best-effort: never let queue/Redis trouble break the dictionary page.
   */
  async requestEnrichment(dictionaryEntryId: string, userId: string): Promise<void> {
    try {
      const existing = await this.queue.getJob(dictionaryEntryId);
      if (existing) {
        const state = await existing.getState();
        // waiting/active/delayed → already in flight; only retry a stale failure.
        if (state !== 'failed') return;
        await existing.remove();
      }

      if (!(await this.consumeDailyQuota(userId))) {
        this.logger.warn(
          `user ${userId} hit daily enrichment cap (${DAILY_CAP}); skipping ${dictionaryEntryId}`,
        );
        return;
      }

      await this.queue.add(
        'enrich',
        { dictionaryEntryId },
        {
          jobId: dictionaryEntryId, // dedup: one in-flight job per entry
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: { age: 86_400 }, // keep a day so AdminJS can see failures
        },
      );
    } catch (err) {
      this.logger.error(
        `failed to enqueue enrichment for ${dictionaryEntryId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Force re-enrichment with a higher-quality model, bypassing the daily quota.
   * Called when a user submits a DOWN vote with content-quality issues.
   * Resets enrichment status so the dictionary page shows the "enriching" spinner again.
   */
  async requestReenrichment(dictionaryEntryId: string): Promise<void> {
    try {
      const existing = await this.queue.getJob(dictionaryEntryId);
      if (existing) await existing.remove();

      await this.queue.add(
        'enrich',
        { dictionaryEntryId, betterModel: true },
        {
          jobId: `reenrich:${dictionaryEntryId}`,
          attempts: 2,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: { age: 86_400 },
        },
      );
    } catch (err) {
      this.logger.error(
        `failed to enqueue re-enrichment for ${dictionaryEntryId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Returns the current enrichment usage for today without incrementing the counter. */
  async getQuota(userId: string): Promise<{ used: number; cap: number }> {
    const key = `enrich:cap:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const raw = await this.redis.get(key);
    return { used: raw ? Number(raw) : 0, cap: DAILY_CAP };
  }

  /** Atomic INCR with a rolling 24h TTL; true while the user is under the cap. */
  private async consumeDailyQuota(userId: string): Promise<boolean> {
    const key = `enrich:cap:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 86_400);
    return count <= DAILY_CAP;
  }
}
