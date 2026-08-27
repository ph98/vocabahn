import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReviewRating } from '@prisma/client';
import {
  STORY_TOPIC_SLUGS,
  compoundDecompositionSchema,
  type CompleteStoryBody,
  type CompleteStoryResponse,
  type CompoundDecomposition,
  type Story as SharedStory,
  type StoryInteractBody,
  type StoryInteractResponse,
  type StoryOrigin,
  type StoryQuizResultItem,
} from '@vocabahn/shared';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { getDateKey } from '../common/date-utils';
import { DictionaryService } from '../dictionary/dictionary.service';
import {
  buildReviewLogSnapshot,
  createScheduler,
  fromFsrsCard,
  ratingToFsrs,
  toFsrsCard,
} from '../fsrs/fsrs';
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
              raw: true,
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
  quizQuestions: {
    orderBy: { order: 'asc' as const },
  },
};

type StoryRow = Prisma.StoryGetPayload<{ include: typeof storyInclude }>;

@Injectable()
export class StoriesService {
  private readonly logger = new Logger(StoriesService.name);
  private readonly scheduler = createScheduler();

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
    private readonly sources: SourcesService,
    private readonly dictionary: DictionaryService,
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
    prompt?: string,
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

    const userPrompt = prompt?.trim() || null;
    const topic = this.resolveTopic(requestedTopic, user?.interests ?? []);
    // Picked at creation, not in the processor, so a retry re-reads the same
    // article rather than silently swapping it under a learner mid-generation.
    // A learner-written idea outranks the news: retelling an unrelated article
    // would ignore what they actually asked for, so no source is picked at all.
    const sourceItem = topic && !userPrompt ? await this.sources.pickForUser(userId, topic) : null;

    // The selected words are pinned as targets up front, with a placeholder
    // surfaceForm. The processor rewrites them once the text exists and each
    // form has been verified against it.
    const story = await this.prisma.story.create({
      data: {
        userId,
        cefrLevel,
        origin,
        topic,
        prompt: userPrompt,
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
   * their stated interests (preset or custom), else nothing — an unsourced story
   * rather than a subject they never chose.
   *
   * Interests are sampled rather than cycled in order, so a learner who picked
   * multiple topics gets a mix instead of the first one every morning.
   */
  private resolveTopic(requested: string | undefined, interests: string[]): string | null {
    if (requested && typeof requested === 'string') {
      const clean = requested.trim();
      if (clean.length > 0 && clean.length <= 50) {
        const preset = (STORY_TOPIC_SLUGS as string[]).find(
          (s) => s.toLowerCase() === clean.toLowerCase(),
        );
        return preset ?? clean;
      }
    }
    const valid = (interests ?? []).filter(
      (slug) => typeof slug === 'string' && slug.trim().length > 0,
    );
    const chosen = valid[Math.floor(Math.random() * valid.length)];
    return chosen ? chosen.trim() : null;
  }

  async get(userId: string, storyId: string): Promise<SharedStory> {
    const story = await this.loadStory(storyId);
    // Same 404 for missing and not-yours — story ids aren't probeable.
    if (!story || story.userId !== userId) {
      throw new NotFoundException('Story not found');
    }
    if (story.status === 'READY' && story.text) {
      await this.ensureAllStoryTargets(story);
      const reloaded = await this.loadStory(storyId);
      return this.toStory(reloaded!);
    }
    return this.toStory(story);
  }

  /**
   * Records comprehension and grades story quiz answers.
   * If quiz answers were submitted, each tested word updates the user's FSRS card,
   * creates a ReviewLog, and recalculates the user's knowledge score.
   */
  async complete(
    userId: string,
    storyId: string,
    body: CompleteStoryBody | string[],
  ): Promise<CompleteStoryResponse> {
    const story = await this.loadStory(storyId);
    if (!story || story.userId !== userId) {
      throw new NotFoundException('Story not found');
    }

    const notUnderstoodList = Array.isArray(body) ? body : (body?.notUnderstood ?? []);
    const quizAnswers = Array.isArray(body) ? [] : (body?.quizAnswers ?? []);

    const tapped = new Set(notUnderstoodList);
    const now = new Date();

    const questions = story.quizQuestions ?? [];
    const quizResults: StoryQuizResultItem[] = [];
    const txOps: Prisma.PrismaPromise<unknown>[] = [];
    const evaluatedEntries = new Set<string>();

    for (const answer of quizAnswers) {
      const q = questions.find((item) => item.id === answer.questionId);
      if (!q) continue;

      const isCorrect = answer.selectedIndex === q.correctIndex;
      evaluatedEntries.add(q.dictionaryEntryId);

      const targetEntry = story.targets.find(
        (t) => t.dictionaryEntryId === q.dictionaryEntryId,
      )?.dictionaryEntry;

      quizResults.push({
        questionId: q.id,
        entryId: q.dictionaryEntryId,
        word: q.targetWord ?? targetEntry?.word ?? '',
        selectedIndex: answer.selectedIndex,
        correctIndex: q.correctIndex,
        correct: isCorrect,
        explanation: q.explanation ?? null,
      });

      txOps.push(
        this.prisma.storyQuizAttempt.create({
          data: {
            questionId: q.id,
            storyId,
            userId,
            selectedIndex: answer.selectedIndex,
            correct: isCorrect,
            latencyMs: answer.latencyMs ?? null,
            createdAt: now,
          },
        }),
      );

      const rating: ReviewRating = isCorrect ? 'GOOD' : 'AGAIN';

      // 1. Find or create Card for (userId, entryId)
      const card = await this.prisma.card.upsert({
        where: { userId_dictionaryEntryId: { userId, dictionaryEntryId: q.dictionaryEntryId } },
        create: {
          userId,
          dictionaryEntryId: q.dictionaryEntryId,
          knownState: 'ACTIVE',
          state: 'NEW',
        },
        update: {},
      });

      // 2. Compute next FSRS state
      const { card: updated } = this.scheduler.next(toFsrsCard(card), now, ratingToFsrs(rating));

      // 3. Update Card, ReviewLog, StoryTarget
      txOps.push(
        this.prisma.card.update({
          where: { id: card.id },
          data: fromFsrsCard(updated),
        }),
        this.prisma.reviewLog.create({
          data: {
            cardId: card.id,
            userId,
            rating,
            latencyMs: answer.latencyMs ?? null,
            ...buildReviewLogSnapshot(updated, now),
          },
        }),
        this.prisma.storyTarget.updateMany({
          where: { storyId, dictionaryEntryId: q.dictionaryEntryId },
          data: { understood: isCorrect, respondedAt: now },
        }),
      );
    }

    // Update remaining targets that weren't quizzed
    const remainingNotUnderstood = [...tapped].filter((id) => !evaluatedEntries.has(id));
    if (remainingNotUnderstood.length > 0) {
      txOps.push(
        this.prisma.storyTarget.updateMany({
          where: { storyId, dictionaryEntryId: { in: remainingNotUnderstood } },
          data: { understood: false, respondedAt: now },
        }),
      );
    }

    txOps.push(
      this.prisma.storyTarget.updateMany({
        where: {
          storyId,
          dictionaryEntryId: { notIn: [...evaluatedEntries, ...remainingNotUnderstood] },
        },
        data: { understood: true, respondedAt: now },
      }),
      this.prisma.story.update({ where: { id: storyId }, data: { completedAt: now } }),
    );

    await this.prisma.$transaction(txOps);

    // Recompute knowledge score and auto-graduation for evaluated cards
    for (const entryId of evaluatedEntries) {
      const card = await this.prisma.card.findUnique({
        where: { userId_dictionaryEntryId: { userId, dictionaryEntryId: entryId } },
        select: { id: true },
      });
      if (card) {
        await this.knowledge.recomputeAfterReview(userId, card.id);
      }
    }

    const updatedStory = await this.loadStory(storyId);
    const correctCount = quizResults.filter((r) => r.correct).length;

    return {
      story: this.toStory(updatedStory!),
      quizResults: quizResults.length > 0 ? quizResults : undefined,
      score:
        quizResults.length > 0
          ? {
              correct: correctCount,
              total: quizResults.length,
            }
          : undefined,
    };
  }

  /**
   * Records a word interaction from the story page.
   * - CLICK_HARD: User clicked the word to view its dictionary popover (was unsure) -> evaluated as HARD in FSRS.
   * - DONT_KNOW_AGAIN: User marked "I don't know this word at all" -> evaluated as AGAIN in FSRS & marked not understood.
   * - RESET: Unmarks the word.
   */
  async interact(
    userId: string,
    storyId: string,
    body: StoryInteractBody,
  ): Promise<StoryInteractResponse> {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, userId: true },
    });
    if (!story || story.userId !== userId) {
      throw new NotFoundException('Story not found');
    }

    const { entryId, action, latencyMs } = body;

    if (action === 'RESET') {
      await this.prisma.storyTarget.updateMany({
        where: { storyId, dictionaryEntryId: entryId },
        data: { understood: null, respondedAt: null },
      });
      return { success: true };
    }

    const rating: ReviewRating = action === 'DONT_KNOW_AGAIN' ? 'AGAIN' : 'HARD';

    // 1. Find or create Card for (userId, entryId)
    const card = await this.prisma.card.upsert({
      where: { userId_dictionaryEntryId: { userId, dictionaryEntryId: entryId } },
      create: {
        userId,
        dictionaryEntryId: entryId,
        knownState: 'ACTIVE',
        state: 'NEW',
      },
      update: {},
    });

    // 2. Compute next FSRS state
    const now = new Date();
    const { card: updated } = this.scheduler.next(toFsrsCard(card), now, ratingToFsrs(rating));

    // 3. Update Card and record ReviewLog row in one transaction
    const txOps: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.card.update({
        where: { id: card.id },
        data: fromFsrsCard(updated),
      }),
      this.prisma.reviewLog.create({
        data: {
          cardId: card.id,
          userId,
          rating,
          latencyMs,
          ...buildReviewLogSnapshot(updated, now),
        },
      }),
    ];

    if (action === 'DONT_KNOW_AGAIN') {
      txOps.push(
        this.prisma.storyTarget.updateMany({
          where: { storyId, dictionaryEntryId: entryId },
          data: { understood: false, respondedAt: now },
        }),
      );
    }

    await this.prisma.$transaction(txOps);

    // 4. Recompute knowledge score and auto-graduation
    await this.knowledge.recomputeAfterReview(userId, card.id);

    return { success: true, cardId: card.id, rating: rating as 'HARD' | 'AGAIN' };
  }

  private async ensureAllStoryTargets(story: StoryRow): Promise<void> {
    if (!story.text) return;
    const words = [...new Set(story.text.match(/[\p{L}ÄÖÜäöüß-]+/gu) || [])];
    const existingEntryIds = new Set(story.targets.map((t) => t.dictionaryEntryId));
    const resolved = await this.dictionary.resolveWordsToEntries(words);

    const toCreate: { dictionaryEntryId: string; surfaceForm: string }[] = [];
    const seen = new Set(existingEntryIds);

    for (const word of words) {
      const match = resolved.get(word.toLowerCase()) ?? resolved.get(word);
      if (match && !seen.has(match.id)) {
        seen.add(match.id);
        toCreate.push({ dictionaryEntryId: match.id, surfaceForm: word });
      }
    }

    if (toCreate.length > 0) {
      await this.prisma.storyTarget.createMany({
        data: toCreate.map((t) => ({
          storyId: story.id,
          dictionaryEntryId: t.dictionaryEntryId,
          surfaceForm: t.surfaceForm,
        })),
        skipDuplicates: true,
      });
    }
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
    if (!story) return null;
    if (story.status === 'READY' && story.text) {
      await this.ensureAllStoryTargets(story);
      const reloaded = await this.loadStory(story.id);
      return this.toStory(reloaded!);
    }
    return this.toStory(story);
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
      prompt: story.prompt,
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
          const example = entry?.examples?.[0];
          const raw = entry?.lexiconEntry?.raw as { compound?: CompoundDecomposition } | undefined;
          const compoundParsed = compoundDecompositionSchema.safeParse(raw?.compound);
          return {
            entryId: t.dictionaryEntryId,
            word: entry?.word ?? t.surfaceForm,
            surfaceForm: t.surfaceForm,
            translation: entry?.translation ?? null,
            emoji: entry?.emoji ?? null,
            pos: entry?.lexiconEntry?.pos ?? 'noun',
            cefrLevel: entry?.cefrLevel ?? null,
            // A sense can exist with no glosses; an empty string would render
            // as a blank line in the popover, so nothing is nothing.
            gloss: entry?.lexiconEntry?.senses?.[0]?.glosses?.[0] ?? null,
            audioUrl: entry?.audioUrl ?? null,
            example: example ? { de: example.de, en: example.en } : null,
            compound: compoundParsed.success ? compoundParsed.data : null,
            understood: t.understood,
          };
        }),
      quiz: (story.quizQuestions ?? []).map((q) => ({
        id: q.id,
        order: q.order,
        entryId: q.dictionaryEntryId,
        targetWord: q.targetWord,
        prompt: q.prompt,
        options: q.options,
        ...(story.completedAt
          ? {
              correctIndex: q.correctIndex,
              explanation: q.explanation ?? null,
            }
          : {}),
      })),
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
