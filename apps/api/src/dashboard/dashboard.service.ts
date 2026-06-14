import { Injectable } from '@nestjs/common';
import type { DashboardResponse } from '@vocabahn/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CoursesService } from '../courses/courses.service';

const HEATMAP_DAYS = 365;

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courses: CoursesService,
  ) {}

  async getDashboard(userId: string): Promise<DashboardResponse> {
    const today = startOfDay(new Date());
    const rangeStart = new Date(today);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - (HEATMAP_DAYS - 1));

    const logs = await this.prisma.reviewLog.findMany({
      where: { userId, reviewedAt: { gte: rangeStart } },
      select: { reviewedAt: true },
    });

    const countsByDate = new Map<string, number>();
    for (const log of logs) {
      const key = dateKey(log.reviewedAt);
      countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
    }

    const heatmap = [];
    for (let i = 0; i < HEATMAP_DAYS; i++) {
      const date = new Date(rangeStart);
      date.setUTCDate(date.getUTCDate() + i);
      const key = dateKey(date);
      heatmap.push({ date: key, count: countsByDate.get(key) ?? 0 });
    }

    const todayKey = dateKey(today);
    const streak = this.computeStreak(countsByDate, today, todayKey);

    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const [dueToday, stateGroups, courses] = await Promise.all([
      this.prisma.card.count({
        where: { userId, knownState: 'ACTIVE', due: { lt: tomorrow } },
      }),
      this.prisma.card.groupBy({
        by: ['state'],
        where: { userId, knownState: 'ACTIVE' },
        _count: { _all: true },
      }),
      this.courses.listCourses(userId),
    ]);

    let totalNew = 0;
    let totalLearning = 0;
    let totalKnown = 0;
    for (const group of stateGroups) {
      if (group.state === 'NEW') totalNew += group._count._all;
      else if (group.state === 'REVIEW') totalKnown += group._count._all;
      else totalLearning += group._count._all;
    }

    return {
      streak,
      heatmap,
      stats: {
        dueToday,
        reviewedToday: countsByDate.get(todayKey) ?? 0,
        totalKnown,
        totalLearning,
        totalNew,
      },
      courses: courses.filter((course) => course.enrolled),
    };
  }

  private computeStreak(countsByDate: Map<string, number>, today: Date, todayKey: string): number {
    const cursor = new Date(today);
    if (!countsByDate.has(todayKey)) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    let streak = 0;
    while (countsByDate.has(dateKey(cursor))) {
      streak++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return streak;
  }
}
