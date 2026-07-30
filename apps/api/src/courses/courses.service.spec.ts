import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { CoursesService } from './courses.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { KnowledgeService } from '../knowledge/knowledge.service';

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
