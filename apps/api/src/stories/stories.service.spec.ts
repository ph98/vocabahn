import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { PrismaService } from '../prisma/prisma.service';
import { STORY_DAILY_CAP } from './stories.constants';
import { StoriesService } from './stories.service';

function entryCard(
  id: string,
  word: string,
  cefrLevel: string,
  frequencyRank: number,
  pos = 'noun',
) {
  return {
    pos,
    dictionaryEntry: {
      id,
      word,
      translation: `${word}-en`,
      emoji: null,
      cefrLevel,
      lexiconEntry: { frequencyRank },
    },
  };
}

type FakeCard = ReturnType<typeof entryCard>;

/**
 * Answers card.findMany the way the database would: honours the NEW/due split
 * and the part-of-speech filter, so tests don't depend on call ordering.
 */
function respondWith(
  findMany: ReturnType<typeof vi.fn>,
  { due = [], fresh = [] }: { due?: FakeCard[]; fresh?: FakeCard[] },
) {
  type FindManyArgs = {
    take?: number;
    where?: {
      state?: string;
      dictionaryEntry?: { lexiconEntry?: { pos?: { in?: string[] } } };
    };
  };
  findMany.mockImplementation((args: FindManyArgs) => {
    const pos = args.where?.dictionaryEntry?.lexiconEntry?.pos?.in;
    const pool = args.where?.state === 'NEW' ? fresh : due;
    const matching = pos ? pool.filter((c) => pos.includes(c.pos)) : pool;
    return Promise.resolve(matching.slice(0, args.take));
  });
}

describe('StoriesService', () => {
  let service: StoriesService;
  let prisma: {
    card: { findMany: ReturnType<typeof vi.fn> };
    user: { findUnique: ReturnType<typeof vi.fn> };
    story: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    storyTarget: { updateMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let queue: { add: ReturnType<typeof vi.fn> };
  let redis: {
    get: ReturnType<typeof vi.fn>;
    incr: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
  };
  let sources: { pickForUser: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = {
      card: { findMany: vi.fn().mockResolvedValue([]) },
      user: {
        findUnique: vi.fn().mockResolvedValue({ cefrLevel: 'B1.1', interests: [] }),
      },
      story: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      storyTarget: { updateMany: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    queue = { add: vi.fn().mockResolvedValue(undefined) };
    redis = { get: vi.fn().mockResolvedValue(null), incr: vi.fn().mockResolvedValue(1), expire: vi.fn() };
    // No feed item by default; the source-picking tests opt in explicitly.
    sources = { pickForUser: vi.fn().mockResolvedValue(null) };

    service = new StoriesService(
      prisma as unknown as PrismaService,
      new KnowledgeService(prisma as unknown as PrismaService),
      sources as never,
      queue as never,
      redis as never,
    );
  });

  /**
   * A persisted target the way `storyInclude` loads it — everything the
   * reader's word popover renders comes from this row, never from a second
   * lookup through DictionaryService.
   */
  function targetRow(
    id: string,
    word: string,
    translation: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      dictionaryEntryId: id,
      surfaceForm: word,
      understood: null,
      dictionaryEntry: {
        id,
        word,
        translation,
        emoji: null,
        cefrLevel: 'A1.1',
        audioUrl: `/api/static/audio/${id}.mp3`,
        examples: [{ de: `Das ${word} ist da.`, en: `The ${translation} is there.` }],
        lexiconEntry: { pos: 'noun', senses: [{ glosses: [translation, 'building'] }] },
        ...overrides,
      },
    };
  }

  function readyStory(overrides: Record<string, unknown> = {}) {
    return {
      id: 'story-1',
      userId: 'user-1',
      status: 'READY',
      cefrLevel: 'B1.1',
      title: 'Der Tag',
      text: 'Das Haus ist grün.',
      translation: 'The house is green.',
      error: null,
      completedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      targets: [
        targetRow('e1', 'Haus', 'house', { emoji: '🏠' }),
        targetRow('e2', 'grün', 'green'),
      ],
      ...overrides,
    };
  }

  describe('create', () => {
    it('refuses once the daily cap is spent', async () => {
      redis.get.mockResolvedValue(String(STORY_DAILY_CAP));

      await expect(service.create('user-1')).rejects.toThrow(ForbiddenException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('refuses when the learner has no active cards', async () => {
      respondWith(prisma.card.findMany, {});

      await expect(service.create('user-1')).rejects.toThrow(BadRequestException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('takes due cards first and enqueues one job for the new story', async () => {
      respondWith(prisma.card.findMany, {
        due: [
          entryCard('e1', 'Haus', 'A1.1', 100),
          entryCard('e2', 'laufen', 'A2.1', 200, 'verb'),
          entryCard('e3', 'grün', 'A2.1', 300, 'adj'),
        ],
      });
      prisma.story.create.mockResolvedValue(readyStory({ status: 'PENDING', targets: [] }));

      const story = await service.create('user-1', 'Europe/Berlin');

      expect(prisma.story.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            cefrLevel: 'B1.1',
            targets: {
              create: [
                { dictionaryEntryId: 'e1', surfaceForm: '' },
                { dictionaryEntryId: 'e2', surfaceForm: '' },
                { dictionaryEntryId: 'e3', surfaceForm: '' },
              ],
            },
          }),
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        'generate',
        { storyId: 'story-1' },
        expect.objectContaining({ jobId: 'story-1', attempts: 3 }),
      );
      expect(redis.incr).toHaveBeenCalledWith(
        expect.stringContaining('story:cap:user-1:'),
      );
      expect(story.id).toBe('story-1');
    });

    it('backfills with the least likely-known new cards when due cards run short', async () => {
      // "Ding" is common and far below B1.1 — a high prior, so it should sort
      // behind the rarer, higher-level word.
      respondWith(prisma.card.findMany, {
        due: [entryCard('e-due', 'Haus', 'A1.1', 100)],
        fresh: [
          entryCard('e-known', 'Ding', 'A1.1', 1),
          entryCard('e-unknown', 'Verfassung', 'B2.2', 9000),
        ],
      });
      prisma.story.create.mockResolvedValue(readyStory({ status: 'PENDING', targets: [] }));

      await service.create('user-1');

      const ids = createdTargetIds();
      expect(ids[0]).toBe('e-due');
      expect(ids.indexOf('e-unknown')).toBeLessThan(ids.indexOf('e-known'));
    });

    it('prefers content words over prepositions and conjunctions', async () => {
      // A due queue of function words produces a story peppered with tappable
      // "von" and "für", which is not a signal worth recording.
      respondWith(prisma.card.findMany, {
        due: [
          entryCard('e-von', 'von', 'A1.1', 5, 'prep'),
          entryCard('e-wenn', 'wenn', 'A1.1', 8, 'conj'),
          entryCard('e-haus', 'Haus', 'A1.1', 100),
          entryCard('e-laufen', 'laufen', 'A2.1', 200, 'verb'),
          entryCard('e-gruen', 'grün', 'A2.1', 300, 'adj'),
          entryCard('e-schnell', 'schnell', 'A2.1', 400, 'adv'),
        ],
      });
      prisma.story.create.mockResolvedValue(readyStory({ status: 'PENDING', targets: [] }));

      await service.create('user-1');

      expect(createdTargetIds()).toEqual(['e-haus', 'e-laufen', 'e-gruen', 'e-schnell']);
    });

    it('falls back to function words when too few content words are due', async () => {
      respondWith(prisma.card.findMany, {
        due: [
          entryCard('e-von', 'von', 'A1.1', 5, 'prep'),
          entryCard('e-wenn', 'wenn', 'A1.1', 8, 'conj'),
          entryCard('e-fuer', 'für', 'A1.1', 9, 'prep'),
          entryCard('e-haus', 'Haus', 'A1.1', 100),
        ],
      });
      prisma.story.create.mockResolvedValue(readyStory({ status: 'PENDING', targets: [] }));

      await service.create('user-1');

      // One content word alone is under STORY_MIN_TARGETS, so take everything.
      expect(createdTargetIds()).toEqual(['e-von', 'e-wenn', 'e-fuer', 'e-haus']);
    });

    it('falls back to A2.1 when the learner has no inferred level', async () => {
      respondWith(prisma.card.findMany, {
        due: [
          entryCard('e1', 'Haus', 'A1.1', 100),
          entryCard('e2', 'laufen', 'A2.1', 200, 'verb'),
          entryCard('e3', 'grün', 'A2.1', 300, 'adj'),
        ],
      });
      prisma.user.findUnique.mockResolvedValue({ cefrLevel: null });
      prisma.story.create.mockResolvedValue(readyStory({ status: 'PENDING', targets: [] }));

      await service.create('user-1');

      expect(prisma.story.create.mock.calls[0][0].data.cefrLevel).toBe('A2.1');
    });
  });

  describe('topic and source selection', () => {
    const SOURCE = {
      id: 'src-1',
      topic: 'football',
      url: 'https://www.kicker.de/psg-1242244/artikel',
      title: 'PSG schafft den Supercup-Doppelpack',
      summary: 'Am Mittwochabend stand die erste Titelentscheidung an.',
      sourceName: 'kicker',
      publishedAt: new Date('2026-08-12T20:55:54Z'),
    };

    beforeEach(() => {
      respondWith(prisma.card.findMany, { due: [entryCard('e1', 'Haus', 'A1.1', 100)] });
      prisma.story.create.mockResolvedValue(readyStory({ status: 'PENDING', targets: [] }));
    });

    function createdData() {
      return prisma.story.create.mock.calls[0][0].data;
    }

    it('uses the topic the learner explicitly asked for', async () => {
      await service.create('user-1', 'UTC', 'football');

      expect(sources.pickForUser).toHaveBeenCalledWith('user-1', 'football');
      expect(createdData().topic).toBe('football');
    });

    it('falls back to one of the learner’s stated interests', async () => {
      prisma.user.findUnique.mockResolvedValue({ cefrLevel: 'B1.1', interests: ['science'] });

      await service.create('user-1');

      expect(createdData().topic).toBe('science');
    });

    it('uses a custom topic when explicitly requested', async () => {
      prisma.user.findUnique.mockResolvedValue({ cefrLevel: 'B1.1', interests: ['science'] });

      await service.create('user-1', 'UTC', 'Specialty Coffee');

      expect(createdData().topic).toBe('Specialty Coffee');
    });

    it('falls back to custom interest when no topic is requested', async () => {
      prisma.user.findUnique.mockResolvedValue({ cefrLevel: 'B1.1', interests: ['Formula 1'] });

      await service.create('user-1');

      expect(createdData().topic).toBe('Formula 1');
    });

    it('leaves the topic null when the learner has stated no interests', async () => {
      await service.create('user-1');

      expect(createdData().topic).toBeNull();
      // No topic means nothing to source from, so the picker is never consulted.
      expect(sources.pickForUser).not.toHaveBeenCalled();
    });

    it('snapshots the attribution rather than relying on the relation', async () => {
      sources.pickForUser.mockResolvedValue(SOURCE);

      await service.create('user-1', 'UTC', 'football');

      // Snapshotting is what lets SourceItem rows be pruned on retention
      // without blanking the credit on a story the learner already read.
      expect(createdData()).toMatchObject({
        sourceItemId: 'src-1',
        sourceTitle: SOURCE.title,
        sourceUrl: SOURCE.url,
        sourceName: 'kicker',
        sourcePublished: SOURCE.publishedAt,
      });
    });

    it('still creates the story when the topic has no fresh item', async () => {
      sources.pickForUser.mockResolvedValue(null);

      await service.create('user-1', 'UTC', 'everyday');

      expect(createdData().topic).toBe('everyday');
      expect(createdData().sourceItemId).toBeNull();
      expect(queue.add).toHaveBeenCalled();
    });
  });

  describe('daily origin', () => {
    beforeEach(() => {
      respondWith(prisma.card.findMany, { due: [entryCard('e1', 'Haus', 'A1.1', 100)] });
      prisma.story.create.mockResolvedValue(readyStory({ status: 'PENDING', targets: [] }));
    });

    it('does not spend the learner’s manual quota', async () => {
      await service.create('user-1', 'UTC', undefined, 'DAILY');

      expect(redis.incr).not.toHaveBeenCalled();
      expect(prisma.story.create.mock.calls[0][0].data.origin).toBe('DAILY');
    });

    it('is written even when the manual quota is already spent', async () => {
      // The scheduled story is a gift, not a withdrawal — a learner who used
      // all ten yesterday still wakes up to one.
      redis.get.mockResolvedValue(String(STORY_DAILY_CAP));

      await expect(service.create('user-1', 'UTC', undefined, 'DAILY')).resolves.toBeDefined();
      expect(queue.add).toHaveBeenCalled();
    });

    it('still spends quota for a story the learner asked for', async () => {
      await service.create('user-1', 'UTC');

      expect(redis.incr).toHaveBeenCalled();
      expect(prisma.story.create.mock.calls[0][0].data.origin).toBe('ON_DEMAND');
    });
  });

  describe('latest', () => {
    it('returns the most recent unfinished story', async () => {
      prisma.story.findFirst.mockResolvedValue(readyStory());

      const story = await service.latest('user-1');

      expect(story?.id).toBe('story-1');
      expect(prisma.story.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1', completedAt: null }),
        }),
      );
    });

    it('returns null when nothing is waiting', async () => {
      prisma.story.findFirst.mockResolvedValue(null);

      await expect(service.latest('user-1')).resolves.toBeNull();
    });
  });

  function createdTargetIds(): string[] {
    const created = prisma.story.create.mock.calls[0][0].data.targets.create;
    return created.map((t: { dictionaryEntryId: string }) => t.dictionaryEntryId);
  }

  describe('get', () => {
    it("hides another learner's story behind a 404", async () => {
      prisma.story.findUnique.mockResolvedValue(readyStory({ userId: 'someone-else' }));

      await expect(service.get('user-1', 'story-1')).rejects.toThrow(NotFoundException);
    });

    it('omits targets that were never verified against the text', async () => {
      const placeholder = targetRow('e9', 'Zettel', 'note');
      prisma.story.findUnique.mockResolvedValue(
        readyStory({
          targets: [
            targetRow('e1', 'Haus', 'house'),
            // Placeholder from creation that the processor never confirmed.
            { ...placeholder, surfaceForm: '' },
          ],
        }),
      );

      const story = await service.get('user-1', 'story-1');

      expect(story.targets.map((t) => t.entryId)).toEqual(['e1']);
    });

    it('carries the entry fields a word popover needs, without a second lookup', async () => {
      // Hovering a word must not spend the learner's enrichment quota, so the
      // story payload ships what the popover renders.
      prisma.story.findUnique.mockResolvedValue(readyStory());

      const story = await service.get('user-1', 'story-1');

      expect(story.targets[0]).toEqual({
        entryId: 'e1',
        word: 'Haus',
        surfaceForm: 'Haus',
        translation: 'house',
        emoji: '🏠',
        pos: 'noun',
        cefrLevel: 'A1.1',
        gloss: 'house',
        audioUrl: '/api/static/audio/e1.mp3',
        example: { de: 'Das Haus ist da.', en: 'The house is there.' },
        understood: null,
      });
    });

    it('reports nulls for a target whose entry is not enriched yet', async () => {
      // Enrichment is lazy, so a target can reach a story with nothing but its
      // headword. The popover shows what exists rather than triggering a fetch.
      prisma.story.findUnique.mockResolvedValue(
        readyStory({
          targets: [
            targetRow('e1', 'Haus', 'house', {
              translation: null,
              cefrLevel: null,
              audioUrl: null,
              examples: [],
              lexiconEntry: { pos: 'noun', senses: [] },
            }),
          ],
        }),
      );

      const story = await service.get('user-1', 'story-1');

      expect(story.targets[0]).toMatchObject({
        word: 'Haus',
        translation: null,
        cefrLevel: null,
        gloss: null,
        audioUrl: null,
        example: null,
      });
    });

    it('surfaces the illustration with the attribution Unsplash requires', async () => {
      prisma.story.findUnique.mockResolvedValue(
        readyStory({
          imageUrl: 'https://images.unsplash.com/photo-1',
          imageAuthorName: 'Ada Fotograf',
          imageAuthorUrl: 'https://unsplash.com/@ada',
          imageSourceUrl: 'https://unsplash.com/photos/abc',
        }),
      );

      const story = await service.get('user-1', 'story-1');

      expect(story.image).toEqual({
        url: 'https://images.unsplash.com/photo-1',
        authorName: 'Ada Fotograf',
        authorUrl: 'https://unsplash.com/@ada',
        sourceUrl: 'https://unsplash.com/photos/abc',
      });
    });

    it('reports no image for a story that never got one', async () => {
      // Every story written before the feature existed, plus any whose lookup
      // failed. A caption with no photo above it is worse than no caption.
      prisma.story.findUnique.mockResolvedValue(readyStory({ imageUrl: null }));

      const story = await service.get('user-1', 'story-1');

      expect(story.image).toBeNull();
    });
  });

  describe('complete', () => {
    it('marks tapped words as not understood and every other target as understood', async () => {
      prisma.story.findUnique.mockResolvedValue(readyStory());

      await service.complete('user-1', 'story-1', ['e2']);

      expect(prisma.storyTarget.updateMany).toHaveBeenCalledWith({
        where: { storyId: 'story-1', dictionaryEntryId: { in: ['e2'] } },
        data: { understood: false, respondedAt: expect.any(Date) },
      });
      expect(prisma.storyTarget.updateMany).toHaveBeenCalledWith({
        where: { storyId: 'story-1', dictionaryEntryId: { notIn: ['e2'] } },
        data: { understood: true, respondedAt: expect.any(Date) },
      });
      expect(prisma.$transaction).toHaveBeenCalledOnce();
    });

    it('marks every target understood when nothing was tapped', async () => {
      prisma.story.findUnique.mockResolvedValue(readyStory());

      await service.complete('user-1', 'story-1', []);

      expect(prisma.storyTarget.updateMany).toHaveBeenCalledWith({
        where: { storyId: 'story-1', dictionaryEntryId: { notIn: [] } },
        data: { understood: true, respondedAt: expect.any(Date) },
      });
    });
  });

  describe('getQuota', () => {
    it('reports zero usage before any story is generated', async () => {
      redis.get.mockResolvedValue(null);
      expect(await service.getQuota('user-1')).toEqual({ used: 0, cap: STORY_DAILY_CAP });
    });

    it('reads the counter without incrementing it', async () => {
      redis.get.mockResolvedValue('3');
      expect(await service.getQuota('user-1')).toEqual({ used: 3, cap: STORY_DAILY_CAP });
      expect(redis.incr).not.toHaveBeenCalled();
    });
  });
});
