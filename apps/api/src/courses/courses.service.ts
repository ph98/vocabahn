import { Injectable, NotFoundException } from '@nestjs/common';
import type { CourseDetail, CourseProgress, CourseSummary, UnenrollResponse } from '@vocabahn/shared';
import { distinctEntryIds, summarizeProgress, type ProgressCardState } from '../common/progress';
import { cefrIndex } from '../knowledge/constants';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  async listCourses(userId: string): Promise<CourseSummary[]> {
    const courses = await this.prisma.course.findMany({
      where: { published: true },
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { words: true } },
        enrollments: { where: { userId }, select: { id: true } },
        words: { select: { dictionaryEntryId: true } },
      },
    });

    // One card query for every enrolled course together, not one per course.
    const enrolledEntryIds = distinctEntryIds(
      courses.filter((c) => c.enrollments.length > 0).flatMap((c) => c.words.map((w) => w.dictionaryEntryId)),
    );
    const cardsByEntry = await this.cardStatesByEntry(userId, enrolledEntryIds);

    return courses.map((course) => {
      const enrolled = course.enrollments.length > 0;
      const entryIds = enrolled ? distinctEntryIds(course.words.map((w) => w.dictionaryEntryId)) : [];
      return {
        id: course.id,
        slug: course.slug,
        title: course.title,
        description: course.description,
        cefrLevel: course.cefrLevel,
        order: course.order,
        isComplete: course.isComplete,
        wordCount: course._count.words,
        enrolled,
        progress: enrolled ? this.summarizeEntries(entryIds, cardsByEntry) : null,
      };
    });
  }

  async getCourse(userId: string, slug: string): Promise<CourseDetail> {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: {
        _count: { select: { words: true } },
        enrollments: { where: { userId }, select: { id: true } },
        words: {
          orderBy: { order: 'asc' },
          include: {
            dictionaryEntry: {
              select: {
                id: true,
                word: true,
                translation: true,
                emoji: true,
                cefrLevel: true,
                lexiconEntry: { select: { pos: true } },
              },
            },
          },
        },
      },
    });
    if (!course || !course.published) {
      throw new NotFoundException('Course not found');
    }

    const enrolled = course.enrollments.length > 0;
    const dictionaryEntryIds = distinctEntryIds(course.words.map((w) => w.dictionaryEntryId));

    const cardsByEntry = enrolled
      ? await this.cardStatesByEntry(userId, dictionaryEntryIds)
      : new Map<string, ProgressCardState>();

    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      cefrLevel: course.cefrLevel,
      order: course.order,
      isComplete: course.isComplete,
      wordCount: course._count.words,
      enrolled,
      progress: enrolled ? this.summarizeEntries(dictionaryEntryIds, cardsByEntry) : null,
      words: course.words.map((w) => ({
        order: w.order,
        dictionaryEntryId: w.dictionaryEntryId,
        word: w.dictionaryEntry.word,
        pos: w.dictionaryEntry.lexiconEntry?.pos,
        translation: w.dictionaryEntry.translation,
        emoji: w.dictionaryEntry.emoji,
        cefrLevel: w.dictionaryEntry.cefrLevel ?? course.cefrLevel,
        cardState: cardsByEntry.get(w.dictionaryEntryId)?.state ?? null,
      })),
    };
  }

  async enroll(userId: string, slug: string): Promise<{ enrolled: true; cardsCreated: number }> {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: { words: { select: { dictionaryEntryId: true } } },
    });
    if (!course || !course.published) {
      throw new NotFoundException('Course not found');
    }

    await this.prisma.userCourse.upsert({
      where: { userId_courseId: { userId, courseId: course.id } },
      create: { userId, courseId: course.id },
      update: {},
    });

    const courseEntryIds = course.words.map((w) => w.dictionaryEntryId);

    const { count } = await this.prisma.card.createMany({
      data: courseEntryIds.map((id) => ({ userId, dictionaryEntryId: id })),
      skipDuplicates: true,
    });

    if (courseEntryIds.length > 0) {
      await this.prisma.card.updateMany({
        where: {
          userId,
          dictionaryEntryId: { in: courseEntryIds },
          knownState: 'SUSPENDED',
        },
        data: { knownState: 'ACTIVE' },
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { cefrLevel: true } });
    const userLevelIndex = cefrIndex(user?.cefrLevel);
    if (userLevelIndex !== null) {
      await this.knowledgeService.batchGraduateHighPrior(userId, userLevelIndex);
    }

    return { enrolled: true, cardsCreated: count };
  }

  async unenroll(userId: string, slug: string): Promise<UnenrollResponse> {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: { words: { select: { dictionaryEntryId: true } } },
    });
    if (!course || !course.published) {
      throw new NotFoundException('Course not found');
    }

    const deleted = await this.prisma.userCourse.deleteMany({
      where: { userId, courseId: course.id },
    });

    if (deleted.count === 0) {
      return { enrolled: false, cardsSuspended: 0 };
    }

    const courseEntryIds = course.words.map((w) => w.dictionaryEntryId);
    if (courseEntryIds.length === 0) {
      return { enrolled: false, cardsSuspended: 0 };
    }

    const [otherCourses, userDecks] = await Promise.all([
      this.prisma.userCourse.findMany({
        where: { userId },
        select: {
          course: {
            select: {
              words: { select: { dictionaryEntryId: true } },
            },
          },
        },
      }),
      this.prisma.userDeck.findMany({
        where: { userId },
        select: {
          words: { select: { dictionaryEntryId: true } },
        },
      }),
    ]);

    const stillNeededEntryIds = new Set<string>();
    for (const c of otherCourses) {
      for (const w of c.course.words) {
        stillNeededEntryIds.add(w.dictionaryEntryId);
      }
    }
    for (const d of userDecks) {
      for (const w of d.words) {
        stillNeededEntryIds.add(w.dictionaryEntryId);
      }
    }

    const entryIdsToSuspend = courseEntryIds.filter((id) => !stillNeededEntryIds.has(id));

    let cardsSuspended = 0;
    if (entryIdsToSuspend.length > 0) {
      const res = await this.prisma.card.updateMany({
        where: {
          userId,
          dictionaryEntryId: { in: entryIdsToSuspend },
          knownState: { not: 'SUSPENDED' },
        },
        data: { knownState: 'SUSPENDED' },
      });
      cardsSuspended = res.count;
    }

    return { enrolled: false, cardsSuspended };
  }

  private async cardStatesByEntry(userId: string, dictionaryEntryIds: string[]): Promise<Map<string, ProgressCardState>> {
    if (dictionaryEntryIds.length === 0) return new Map();
    const cards = await this.prisma.card.findMany({
      where: { userId, dictionaryEntryId: { in: dictionaryEntryIds } },
      select: { dictionaryEntryId: true, state: true, knownState: true },
    });
    return new Map(cards.map((c) => [c.dictionaryEntryId, { state: c.state, knownState: c.knownState }]));
  }

  /** `entryIds` must already be distinct — an entry listed twice must not count twice. */
  private summarizeEntries(entryIds: string[], cardsByEntry: Map<string, ProgressCardState>): CourseProgress {
    const cards = entryIds.map((id) => cardsByEntry.get(id)).filter((c): c is ProgressCardState => c !== undefined);
    return summarizeProgress(cards, entryIds.length);
  }
}
