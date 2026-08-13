import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  STORY_TOPIC_SLUGS,
  type Story as SharedStory,
  type StoryOrigin,
} from '@vocabahn/shared';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { getDateKey } from '../common/date-utils';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { SourcesService } from '../sources/sources.service';
import {
  STORY_CONTENT_POS,
  STORY_DAILY_CAP,
  STORY_FALLBACK_LEVEL,
  STORY_MIN_TARGETS,
  STORY_QUEUE,
  STORY_TARGET_COUNT,
  type StoryJobData,
} from './stories.constants';

// Everything a story needs about a word: the headword to weave in, plus the
// level/frequency the knowledge prior ranks on.
const entrySelect = {
  dictionaryEntry: {
    select: {
      id: true,
      word: true,
      translation: true,
      emoji: true,
      cefrLevel: true,
      lexiconEntry: { select: { frequencyRank: true } },
    },
  },
};

// What a reader's word popover shows, read straight off the persisted
// DictionaryEntry. Going through DictionaryService.getEntry would trigger lazy
// enrichment and spend the learner's daily quota, so the story payload carries
// the display fields instead — one round trip, no external call.
//
// The nested `take: 1`s keep this bounded: Prisma loads each relation level in
// one query keyed on the parent ids, so the cost is fixed regardless of how
// many targets a story has.
const storyInclude = {
  targets: {
    include: {
      dictionaryEntry: {
        select: {
          id: true,
          word: true,
          translation: true,
          emoji: true,
          cefrLevel: true,
          audioUrl: true,
          examples: {
            select: { de: true, en: true },
            orderBy: { order: 'asc' as const },
            take: 1,
          },
          lexiconEntry: {
            select: {
              pos: true,
              senses: {
                select: { glosses: true },
                orderBy: { order: 'asc' as const },
                take: 1,
              },
            },
          },
        },
      },
    },
  },
};

type StoryRow = Prisma.StoryGetPayload<{ include: typeof storyInclude }>;

@Injectable()
export class StoriesService {
  private readonly logger = new Logger(StoriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
    private readonly sources: SourcesService,
    @InjectQueue(STORY_QUEUE) private readonly queue: Queue<StoryJobData>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Creates a story row and hands generation to the queue. Returns immediately
   * in PENDING; the client polls until READY or FAILED.
   *
   * `origin` distinguishes a story the learner asked for from one the scheduler
   * wrote for them; only the former spends quota.
   */
  async create(
    userId: string,
    timeZone = 'UTC',
    requestedTopic?: string,
    origin: StoryOrigin = 'ON_DEMAND',
  ): Promise<SharedStory> {
    if (origin === 'ON_DEMAND') {
      const quota = await this.getQuota(userId, timeZone);
      if (quota.used >= quota.cap) {
        throw new ForbiddenException(
          `Daily story limit reached (${quota.used}/${quota.cap}). Try again tomorrow.`,
        );
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { cefrLevel: true, interests: true },
    });
    const cefrLevel = user?.cefrLevel ?? STORY_FALLBACK_LEVEL;

    const words = await this.selectWords(userId, user?.cefrLevel ?? null);
    if (words.length === 0) {
      throw new BadRequestException(
        'No words to build a story from yet — enroll in a course or add a deck first.',
      );
    }

    const topic = this.resolveTopic(requestedTopic, user?.interests ?? []);
    // Picked at creation, not in the processor, so a retry re-reads the same
    // article rather than silently swapping it under a learner mid-generation.
    const sourceItem = topic ? await this.sources.pickForUser(userId, topic) : null;

    // The selected words are pinned as targets up front, with a placeholder
    // surfaceForm. The processor rewrites them once the text exists and each
    // form has been verified against it.
    const story = await this.prisma.story.create({
      data: {
        userId,
        cefrLevel,
        origin,
        topic,
        stage: 'WRITING',
        sourceItemId: sourceItem?.id ?? null,
        // Snapshotted so attribution outlives the source item's retention.
        sourceTitle: sourceItem?.title ?? null,
        sourceUrl: sourceItem?.url ?? null,
        sourceName: sourceItem?.sourceName ?? null,
        sourcePublished: sourceItem?.publishedAt ?? null,
        targets: {
          create: words.map((w) => ({ dictionaryEntryId: w.id, surfaceForm: '' })),
        },
      },
      include: storyInclude,
    });

    if (origin === 'ON_DEMAND') {
      await this.consumeDailyQuota(userId, timeZone);
    }

    await this.queue.add(
      'generate',
      { storyId: story.id },
      {
        jobId: story.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: { age: 86_400 },
      },
    );

    return this.toStory(story);
  }

  /**
   * Which subject this story is about: what the learner asked for, else one of
   * their stated interests, else nothing — an unsourced story rather than a
   * subject they never chose.
   *
   * Interests are sampled rather than cycled in order, so a learner who picked
   * three topics gets a mix instead of the first one every morning.
   */
  private resolveTopic(requested: string | undefined, interests: string[]): string | null {
    if (requested && (STORY_TOPIC_SLUGS as string[]).includes(requested)) return requested;
    // An unknown slug is a client bug, not a reason to fail the request; fall
    // through to the learner's own interests.
    const known = interests.filter((slug) => (STORY_TOPIC_SLUGS as string[]).includes(slug));
    if (known.length === 0) return null;
    return known[Math.floor(Math.random() * known.length)] ?? null;
  }

  async get(userId: string, storyId: string): Promise<SharedStory> {
    const story = await this.loadStory(storyId);
    // Same 404 for missing and not-yours — story ids aren't probeable.
    if (!story || story.userId !== userId) {
      throw new NotFoundException('Story not found');
    }
    return this.toStory(story);
  }

  /**
   * Records comprehension: every target the learner tapped is `false`, the rest
   * `true`. Idempotent — re-completing overwrites the previous answer.
   */
  async complete(
    userId: string,
    storyId: string,
    notUnderstood: string[],
  ): Promise<SharedStory> {
    const story = await this.loadStory(storyId);
    if (!story || story.userId !== userId) {
      throw new NotFoundException('Story not found');
    }

    const tapped = new Set(notUnderstood);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.storyTarget.updateMany({
        where: { storyId, dictionaryEntryId: { in: [...tapped] } },
        data: { understood: false, respondedAt: now },
      }),
      this.prisma.storyTarget.updateMany({
        where: { storyId, dictionaryEntryId: { notIn: [...tapped] } },
        data: { understood: true, respondedAt: now },
      }),
      this.prisma.story.update({ where: { id: storyId }, data: { completedAt: now } }),
    ]);

    const updated = await this.loadStory(storyId);
    return this.toStory(updated!);
  }

  /**
   * The story the learner should land on: their most recent unfinished one.
   * This is what makes a scheduled story findable — it was written while they
   * were asleep, on a device that has never heard of it — and it incidentally
   * carries an unfinished story across browsers.
   */
  async latest(userId: string): Promise<SharedStory | null> {
    const story = await this.prisma.story.findFirst({
      where: { userId, completedAt: null, status: { not: 'FAILED' } },
      orderBy: { createdAt: 'desc' },
      include: storyInclude,
    });
    return story ? this.toStory(story) : null;
  }

  /** Current story usage for today, without incrementing. */
  async getQuota(userId: string, timeZone = 'UTC'): Promise<{ used: number; cap: number }> {
    const raw = await this.redis.get(this.quotaKey(userId, timeZone));
    return { used: raw ? Number(raw) : 0, cap: STORY_DAILY_CAP };
  }

  /**
   * The words a story is built from: due reviews first, then the least
   * likely-known new cards — the same shape a review session would introduce.
   * Content words only, unless the learner has too few of those due.
   */
  private async selectWords(
    userId: string,
    userCefrLevel: string | null,
    count = STORY_TARGET_COUNT,
  ) {
    const args = [userId, userCefrLevel, count] as const;
    const contentWords = await this.selectWordsWithPos(...args, STORY_CONTENT_POS);
    if (contentWords.length >= STORY_MIN_TARGETS) return contentWords;

    // Not enough nouns/verbs/adjectives due — better a story built from
    // whatever they are studying than no story at all. The unfiltered pass is a
    // superset, but compare anyway rather than assume it.
    const anyWords = await this.selectWordsWithPos(...args, null);
    return anyWords.length > contentWords.length ? anyWords : contentWords;
  }

  private async selectWordsWithPos(
    userId: string,
    userCefrLevel: string | null,
    count: number,
    pos: string[] | null,
  ) {
    const base = {
      userId,
      knownState: 'ACTIVE' as const,
      ...(pos ? { dictionaryEntry: { lexiconEntry: { pos: { in: pos } } } } : {}),
    };

    const due = await this.prisma.card.findMany({
      where: { ...base, due: { lte: new Date() }, state: { not: 'NEW' as const } },
      orderBy: { due: 'asc' },
      take: count,
      select: entrySelect,
    });
    if (due.length >= count) return due.map((c) => c.dictionaryEntry);

    const remaining = count - due.length;
    const fresh = await this.prisma.card.findMany({
      where: {
        ...base,
        state: 'NEW' as const,
        dictionaryEntryId: { notIn: due.map((d) => d.dictionaryEntry.id) },
      },
      // Over-fetch so the prior has something to rank, as getDueCards does.
      take: Math.max(remaining * 3, remaining),
      select: entrySelect,
    });

    const ordered = this.knowledge.orderByPrior(userCefrLevel, fresh);

    return [...due, ...ordered.slice(0, remaining)].map((c) => c.dictionaryEntry);
  }

  private loadStory(storyId: string) {
    return this.prisma.story.findUnique({ where: { id: storyId }, include: storyInclude });
  }

  private toStory(story: StoryRow): SharedStory {
    return {
      id: story.id,
      status: story.status,
      // Only meaningful mid-generation; a finished story reports no stage.
      stage: story.status === 'PENDING' || story.status === 'GENERATING' ? story.stage : null,
      origin: story.origin,
      topic: story.topic,
      // A story either has full attribution or none — a link without a title
      // would render as a bare URL, so the whole block is gated on the URL.
      source:
        story.sourceUrl && story.sourceTitle
          ? {
              title: story.sourceTitle,
              url: story.sourceUrl,
              name: story.sourceName ?? 'Source',
              publishedAt: story.sourcePublished?.toISOString() ?? null,
            }
          : null,
      cefrLevel: story.cefrLevel,
      title: story.title,
      text: story.text,
      translation: story.translation,
      audioUrl: story.audioUrl,
      // Gated on the URL for the same reason `source` is: an attribution
      // caption with no photo above it is worse than no caption at all.
      image: story.imageUrl
        ? {
            url: story.imageUrl,
            authorName: story.imageAuthorName ?? 'Unknown',
            authorUrl: story.imageAuthorUrl,
            sourceUrl: story.imageSourceUrl,
          }
        : null,
      error: story.error,
      completedAt: story.completedAt?.toISOString() ?? null,
      createdAt: story.createdAt.toISOString(),
      // Placeholder targets exist before generation finishes; only surface the
      // ones the processor has verified against the text.
      targets: story.targets
        .filter((t) => t.surfaceForm !== '')
        .map((t) => {
          const entry = t.dictionaryEntry;
          const example = entry.examples[0];
          return {
            entryId: t.dictionaryEntryId,
            word: entry.word,
            surfaceForm: t.surfaceForm,
            translation: entry.translation,
            emoji: entry.emoji,
            pos: entry.lexiconEntry.pos,
            cefrLevel: entry.cefrLevel,
            // A sense can exist with no glosses; an empty string would render
            // as a blank line in the popover, so nothing is nothing.
            gloss: entry.lexiconEntry.senses[0]?.glosses[0] ?? null,
            audioUrl: entry.audioUrl,
            example: example ? { de: example.de, en: example.en } : null,
            understood: t.understood,
          };
        }),
    };
  }

  private quotaKey(userId: string, timeZone: string): string {
    return `story:cap:${userId}:${getDateKey(new Date(), timeZone)}`;
  }

  /** Atomic INCR with a rolling 24h TTL. */
  private async consumeDailyQuota(userId: string, timeZone: string): Promise<void> {
    const key = this.quotaKey(userId, timeZone);
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 86_400);
  }
}
