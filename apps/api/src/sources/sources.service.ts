import { Injectable, Logger } from '@nestjs/common';
import type { SourceItem } from '@prisma/client';
import { STORY_TOPIC_SLUGS, type StoryTopic } from '@vocabahn/shared';
import { PrismaService } from '../prisma/prisma.service';
import { parseFeed } from './feed-parser';
import {
  SOURCE_FETCH_TIMEOUT_MS,
  SOURCE_ITEMS_PER_FEED,
  SOURCE_MAX_AGE_DAYS,
  SOURCE_MIN_SUMMARY_CHARS,
  SOURCE_RETENTION_DAYS,
  TOPIC_FEEDS,
  type FeedDefinition,
} from './sources.constants';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SourcesService {
  private readonly logger = new Logger(SourcesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Re-polls every configured feed and prunes what has aged out. Runs on a
   * repeatable job; one broken publisher must not stop the others, so each feed
   * is caught individually.
   */
  async refreshAll(): Promise<{ topic: string; added: number }[]> {
    const results: { topic: string; added: number }[] = [];

    for (const topic of STORY_TOPIC_SLUGS) {
      let added = 0;
      for (const feed of TOPIC_FEEDS[topic]) {
        try {
          added += await this.refreshFeed(topic, feed);
        } catch (err) {
          this.logger.warn(
            `feed ${feed.url} failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      if (added > 0) results.push({ topic, added });
    }

    const pruned = await this.pruneStale();
    this.logger.log(
      `source refresh: ${results.reduce((sum, r) => sum + r.added, 0)} new items, ${pruned} pruned`,
    );
    return results;
  }

  /** Fetches one feed and upserts its items. Returns how many were new. */
  private async refreshFeed(topic: StoryTopic, feed: FeedDefinition): Promise<number> {
    const xml = await this.fetchText(feed.url);
    const items = parseFeed(xml)
      // A bare headline gives the model nothing to ground a retelling in.
      .filter((item) => item.summary.length >= SOURCE_MIN_SUMMARY_CHARS)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, SOURCE_ITEMS_PER_FEED);

    // `url` is unique, so re-polling a feed re-sees items it already stored.
    // Skipping duplicates rather than upserting keeps an item's identity — and
    // therefore which learners have read it — stable across polls, and makes
    // the returned count exactly the number of genuinely new items.
    const { count } = await this.prisma.sourceItem.createMany({
      data: items.map((item) => ({
        topic,
        url: item.url,
        title: item.title,
        summary: item.summary,
        sourceName: feed.sourceName,
        publishedAt: item.publishedAt,
      })),
      skipDuplicates: true,
    });

    return count;
  }

  private async fetchText(url: string): Promise<string> {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
      headers: {
        // Some publishers reject the default fetch agent outright.
        'User-Agent': 'Vocabahn/1.0 (+https://vocabahn.app)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  /**
   * The item a story should be built from: the most recent one on the topic
   * that this learner has not already been given. Returns null when the topic
   * has no feed, the refresh has never run, or the learner has read everything
   * recent — all of which the caller handles by generating without a source.
   */
  async pickForUser(userId: string, topic: string): Promise<SourceItem | null> {
    const alreadyRead = await this.prisma.story.findMany({
      where: { userId, sourceItemId: { not: null } },
      select: { sourceItemId: true },
      // Bounded: a learner capped at ~10 stories a day cannot outrun this
      // within the retention window, and an unbounded IN list is a footgun.
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return this.prisma.sourceItem.findFirst({
      where: {
        topic,
        publishedAt: { gte: new Date(Date.now() - SOURCE_MAX_AGE_DAYS * DAY_MS) },
        id: { notIn: alreadyRead.map((s) => s.sourceItemId!) },
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  /** True when at least one topic has usable material. */
  async hasFreshItems(): Promise<boolean> {
    const count = await this.prisma.sourceItem.count({
      where: { publishedAt: { gte: new Date(Date.now() - SOURCE_MAX_AGE_DAYS * DAY_MS) } },
    });
    return count > 0;
  }

  /**
   * Drops items past the retention window. Stories keep their own snapshot of
   * the attribution, so pruning a source never blanks a story the learner read.
   */
  private async pruneStale(): Promise<number> {
    const { count } = await this.prisma.sourceItem.deleteMany({
      where: { publishedAt: { lt: new Date(Date.now() - SOURCE_RETENTION_DAYS * DAY_MS) } },
    });
    return count;
  }
}
