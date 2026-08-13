import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { summarizeProgress, type ProgressCardState } from '../common/progress';
import type { PrismaService } from '../prisma/prisma.service';
import type { KnowledgeService } from '../knowledge/knowledge.service';

/** Shorthand for a card row as `summarizeProgress` sees it. */
const card = (state: ProgressCardState['state'], knownState: ProgressCardState['knownState'] = 'ACTIVE'): ProgressCardState => ({
  state,
  knownState,
});

type MockPrisma = {
  course: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  userCourse: {
    upsert: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  userDeck: {
    findMany: ReturnType<typeof vi.fn>;
  };
  card: {
    createMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  user: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

type MockKnowledge = {
  batchGraduateHighPrior: ReturnType<typeof vi.fn>;
};

describe('CoursesService', () => {
  let service: CoursesService;
  let mockPrisma: MockPrisma;
  let mockKnowledge: MockKnowledge;

  beforeEach(() => {
    mockPrisma = {
      course: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      userCourse: {
        upsert: vi.fn(),
        deleteMany: vi.fn(),
        findMany: vi.fn(),
      },
      userDeck: {
        findMany: vi.fn(),
      },
      card: {
        createMany: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
    };

    mockKnowledge = {
      batchGraduateHighPrior: vi.fn(),
    };

    service = new CoursesService(
      mockPrisma as unknown as PrismaService,
      mockKnowledge as unknown as KnowledgeService,
    );
  });

  describe('summarizeProgress buckets', () => {
    it('counts FSRS REVIEW as learned', () => {
      expect(summarizeProgress([card('REVIEW')], 1)).toEqual({ learned: 1, inProgress: 0, notStarted: 0 });
    });

    it('counts a card auto-graduated while still LEARNING as learned, not in progress', () => {
      // recomputeAfterReview() writes knownState without touching FSRS state, so this
      // is the case that used to pin the bar below 100% forever.
      expect(summarizeProgress([card('LEARNING', 'AUTO_KNOWN')], 1)).toEqual({
        learned: 1,
        inProgress: 0,
        notStarted: 0,
      });
    });

    it('counts a manually marked-known card as learned whatever its FSRS state', () => {
      expect(summarizeProgress([card('NEW', 'USER_KNOWN'), card('RELEARNING', 'USER_KNOWN')], 2)).toEqual({
        learned: 2,
        inProgress: 0,
        notStarted: 0,
      });
    });

    it('reaches 100% learned when every word is known by any route', () => {
      const cards = [card('REVIEW'), card('LEARNING', 'AUTO_KNOWN'), card('NEW', 'USER_KNOWN')];
      expect(summarizeProgress(cards, 3)).toEqual({ learned: 3, inProgress: 0, notStarted: 0 });
    });

    it('counts RELEARNING as in progress — a lapsed word has to be re-earned', () => {
      expect(summarizeProgress([card('RELEARNING'), card('LEARNING')], 2)).toEqual({
        learned: 0,
        inProgress: 2,
        notStarted: 0,
      });
    });

    it('counts a NEW card as not started — enrolment creates one per word before anything is shown', () => {
      expect(summarizeProgress([card('NEW'), card('NEW')], 5)).toEqual({
        learned: 0,
        inProgress: 0,
        notStarted: 5,
      });
    });

    it('leaves a SUSPENDED card to its FSRS state rather than treating it as known', () => {
      expect(summarizeProgress([card('LEARNING', 'SUSPENDED'), card('REVIEW', 'SUSPENDED')], 2)).toEqual({
        learned: 1,
        inProgress: 1,
        notStarted: 0,
      });
    });

    it('never returns a negative notStarted when there are more cards than words', () => {
      expect(summarizeProgress([card('REVIEW'), card('LEARNING')], 1)).toEqual({
        learned: 1,
        inProgress: 1,
        notStarted: 0,
      });
    });

    it('always sums to the word total', () => {
      const cards = [card('REVIEW'), card('RELEARNING'), card('NEW'), card('LEARNING', 'AUTO_KNOWN')];
      const progress = summarizeProgress(cards, 10);
      expect(progress.learned + progress.inProgress + progress.notStarted).toBe(10);
    });
  });

  describe('listCourses progress', () => {
    const courseFixture = (words: { dictionaryEntryId: string }[]) => ({
      id: 'course-1',
      slug: 'a1-basics',
      title: 'A1 Basics',
      description: null,
      cefrLevel: 'A1',
      order: 0,
      isComplete: true,
      published: true,
      _count: { words: words.length },
      enrollments: [{ id: 'enrollment-1' }],
      words,
    });

    it('does not count a duplicated entry twice', async () => {
      // wordCount says 3, but only two distinct entries exist.
      mockPrisma.course.findMany.mockResolvedValue([
        courseFixture([{ dictionaryEntryId: 'e1' }, { dictionaryEntryId: 'e1' }, { dictionaryEntryId: 'e2' }]),
      ]);
      mockPrisma.card.findMany.mockResolvedValue([
        { dictionaryEntryId: 'e1', state: 'REVIEW', knownState: 'ACTIVE' },
      ]);

      const [course] = await service.listCourses('user-1');

      expect(course.wordCount).toBe(3);
      expect(course.progress).toEqual({ learned: 1, inProgress: 0, notStarted: 1 });
    });

    it('reports 100% learned for a course whose words are all known', async () => {
      mockPrisma.course.findMany.mockResolvedValue([
        courseFixture([{ dictionaryEntryId: 'e1' }, { dictionaryEntryId: 'e2' }]),
      ]);
      mockPrisma.card.findMany.mockResolvedValue([
        { dictionaryEntryId: 'e1', state: 'LEARNING', knownState: 'AUTO_KNOWN' },
        { dictionaryEntryId: 'e2', state: 'REVIEW', knownState: 'ACTIVE' },
      ]);

      const [course] = await service.listCourses('user-1');

      expect(course.progress).toEqual({ learned: 2, inProgress: 0, notStarted: 0 });
    });

    it('issues one card query for all enrolled courses rather than one per course', async () => {
      mockPrisma.course.findMany.mockResolvedValue([
        { ...courseFixture([{ dictionaryEntryId: 'e1' }]), id: 'course-1', slug: 'a1' },
        { ...courseFixture([{ dictionaryEntryId: 'e2' }]), id: 'course-2', slug: 'a2' },
        { ...courseFixture([{ dictionaryEntryId: 'e3' }]), id: 'course-3', slug: 'b1', enrollments: [] },
      ]);
      mockPrisma.card.findMany.mockResolvedValue([]);

      const courses = await service.listCourses('user-1');

      expect(mockPrisma.card.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.card.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', dictionaryEntryId: { in: ['e1', 'e2'] } },
        select: { dictionaryEntryId: true, state: true, knownState: true },
      });
      // An unenrolled course reports no progress at all, distinct from 0% progress.
      expect(courses[2].progress).toBeNull();
    });
  });

  describe('unenroll', () => {
    it('throws NotFoundException if course does not exist or is unpublished', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);

      await expect(service.unenroll('user-1', 'invalid-slug')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns cardsSuspended 0 if user was not enrolled', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'course-1',
        slug: 'a1-basics',
        published: true,
        words: [{ dictionaryEntryId: 'entry-1' }],
      });
      mockPrisma.userCourse.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.unenroll('user-1', 'a1-basics');

      expect(result).toEqual({ enrolled: false, cardsSuspended: 0 });
      expect(mockPrisma.userCourse.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', courseId: 'course-1' },
      });
    });

    it('suspends only unique cards and leaves shared course/deck cards active', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'course-1',
        slug: 'a1-basics',
        published: true,
        words: [
          { dictionaryEntryId: 'entry-1' }, // unique to course-1
          { dictionaryEntryId: 'entry-2' }, // shared with course-2
          { dictionaryEntryId: 'entry-3' }, // shared with user deck
        ],
      });
      mockPrisma.userCourse.deleteMany.mockResolvedValue({ count: 1 });

      // User is also enrolled in course-2 which contains entry-2
      mockPrisma.userCourse.findMany.mockResolvedValue([
        {
          course: {
            words: [{ dictionaryEntryId: 'entry-2' }],
          },
        },
      ]);

      // User has a deck containing entry-3
      mockPrisma.userDeck.findMany.mockResolvedValue([
        {
          words: [{ dictionaryEntryId: 'entry-3' }],
        },
      ]);

      mockPrisma.card.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.unenroll('user-1', 'a1-basics');

      expect(result).toEqual({ enrolled: false, cardsSuspended: 1 });
      expect(mockPrisma.card.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          dictionaryEntryId: { in: ['entry-1'] },
          knownState: { not: 'SUSPENDED' },
        },
        data: { knownState: 'SUSPENDED' },
      });
    });
  });

  describe('enroll', () => {
    it('reactivates suspended cards when re-enrolling', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'course-1',
        slug: 'a1-basics',
        published: true,
        words: [{ dictionaryEntryId: 'entry-1' }],
      });
      mockPrisma.userCourse.upsert.mockResolvedValue({});
      mockPrisma.card.createMany.mockResolvedValue({ count: 0 }); // card already exists
      mockPrisma.card.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.findUnique.mockResolvedValue({ cefrLevel: null });

      const result = await service.enroll('user-1', 'a1-basics');

      expect(result).toEqual({ enrolled: true, cardsCreated: 0 });
      expect(mockPrisma.card.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          dictionaryEntryId: { in: ['entry-1'] },
          knownState: 'SUSPENDED',
        },
        data: { knownState: 'ACTIVE' },
      });
    });
  });
});
