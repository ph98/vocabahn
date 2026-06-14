import { Injectable, NotFoundException } from '@nestjs/common';
import type { CourseDetail, CourseProgress, CourseSummary, FsrsState } from '@vocabahn/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

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

    return Promise.all(
      courses.map(async (course) => {
        const enrolled = course.enrollments.length > 0;
        return {
          id: course.id,
          slug: course.slug,
          title: course.title,
          description: course.description,
          cefrLevel: course.cefrLevel,
          order: course.order,
          wordCount: course._count.words,
          enrolled,
          progress: enrolled
            ? await this.computeProgress(
                userId,
                course.words.map((w) => w.dictionaryEntryId),
              )
            : null,
        };
      }),
    );
  }

  async getCourse(userId: string, slug: string): Promise<CourseDetail> {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: {
        _count: { select: { words: true } },
        enrollments: { where: { userId }, select: { id: true } },
        words: {
          orderBy: { order: 'asc' },
          include: { dictionaryEntry: { select: { id: true, word: true, translation: true, emoji: true, cefrLevel: true } } },
        },
      },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const enrolled = course.enrollments.length > 0;
    const dictionaryEntryIds = course.words.map((w) => w.dictionaryEntryId);

    const cardsByEntry = enrolled ? await this.cardStatesByEntry(userId, dictionaryEntryIds) : new Map<string, FsrsState>();

    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      cefrLevel: course.cefrLevel,
      order: course.order,
      wordCount: course._count.words,
      enrolled,
      progress: enrolled ? this.summarizeStates([...cardsByEntry.values()], course._count.words) : null,
      words: course.words.map((w) => ({
        order: w.order,
        dictionaryEntryId: w.dictionaryEntryId,
        word: w.dictionaryEntry.word,
        translation: w.dictionaryEntry.translation,
        emoji: w.dictionaryEntry.emoji,
        cefrLevel: w.dictionaryEntry.cefrLevel,
        cardState: cardsByEntry.get(w.dictionaryEntryId) ?? null,
      })),
    };
  }

  async enroll(userId: string, slug: string): Promise<{ enrolled: true; cardsCreated: number }> {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: { words: { select: { dictionaryEntryId: true } } },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    await this.prisma.userCourse.upsert({
      where: { userId_courseId: { userId, courseId: course.id } },
      create: { userId, courseId: course.id },
      update: {},
    });

    const { count } = await this.prisma.card.createMany({
      data: course.words.map((w) => ({ userId, dictionaryEntryId: w.dictionaryEntryId })),
      skipDuplicates: true,
    });

    return { enrolled: true, cardsCreated: count };
  }

  private async cardStatesByEntry(userId: string, dictionaryEntryIds: string[]): Promise<Map<string, FsrsState>> {
    const cards = await this.prisma.card.findMany({
      where: { userId, dictionaryEntryId: { in: dictionaryEntryIds } },
      select: { dictionaryEntryId: true, state: true },
    });
    return new Map(cards.map((c) => [c.dictionaryEntryId, c.state]));
  }

  private async computeProgress(userId: string, dictionaryEntryIds: string[]): Promise<CourseProgress> {
    const states = [...(await this.cardStatesByEntry(userId, dictionaryEntryIds)).values()];
    return this.summarizeStates(states, dictionaryEntryIds.length);
  }

  private summarizeStates(states: FsrsState[], totalWords: number): CourseProgress {
    const learned = states.filter((s) => s === 'REVIEW').length;
    const inProgress = states.length - learned;
    const notStarted = totalWords - states.length;
    return { learned, inProgress, notStarted };
  }
}
