import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { SOURCE_QUEUE, SOURCE_REFRESH_INTERVAL_MS, type SourceJobData } from './sources.constants';
import { SourcesService } from './sources.service';

/**
 * Polls every publisher feed on a repeatable schedule. Concurrency 1: this is
 * a handful of HTTP GETs against a shared table, and running two polls at once
 * only creates write contention.
 */
@Injectable()
@Processor(SOURCE_QUEUE, { concurrency: 1 })
export class SourceProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(SourceProcessor.name);

  constructor(
    private readonly sources: SourcesService,
    @InjectQueue(SOURCE_QUEUE) private readonly queue: Queue<SourceJobData>,
  ) {
    super();
  }

  /**
   * Registers the repeatable job at boot. A fixed `jobId` makes this idempotent
   * across restarts and across API replicas — BullMQ keeps one scheduler per
   * key, so N replicas do not produce N polls.
   */
  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'refresh',
      {},
      {
        jobId: 'source-refresh-repeat',
        repeat: { every: SOURCE_REFRESH_INTERVAL_MS },
        removeOnComplete: true,
        removeOnFail: { count: 20 },
      },
    );

    // Cold start: a fresh deploy has an empty table and the first repeat is a
    // full interval away, which would leave every story unsourced until then.
    const hasItems = await this.sources.hasFreshItems().catch(() => true);
    if (!hasItems) {
      this.logger.log('no fresh source items — running an immediate refresh');
      await this.queue.add('refresh', {}, { removeOnComplete: true });
    }
  }

  async process(): Promise<void> {
    await this.sources.refreshAll();
  }
}
