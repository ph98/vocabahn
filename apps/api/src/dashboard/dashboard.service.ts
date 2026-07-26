import { Injectable } from '@nestjs/common';
import type { DashboardResponse } from '@vocabahn/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CoursesService } from '../courses/courses.service';
import { getDateKey, getLocalMidnightInUtc, nextDateKey, prevDateKey } from '../common/date-utils';

const HEATMAP_DAYS = 365;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courses: CoursesService,
  ) {}

  async getDashboard(userId: string, timeZone?: string): Promise<DashboardResponse> {
    let tz = timeZone;
    if (!tz || tz === 'UTC') {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { timezone: true },
      });
      if (user?.timezone) {
        tz = user.timezone;
      }
    }
    tz = tz || 'UTC';

    const now = new Date();
    const todayKey = getDateKey(now, tz);

    const heatmapDateKeys: string[] = [];
    let curKey = todayKey;
    for (let i = 0; i < HEATMAP_DAYS; i++) {
      heatmapDateKeys.unshift(curKey);
      if (i < HEATMAP_DAYS - 1) {
        curKey = prevDateKey(curKey);
      }
    }

    const rangeStartKey = heatmapDateKeys[0] ?? todayKey;
    const rangeStartUtc = getLocalMidnightInUtc(rangeStartKey, tz);

    const logs = await this.prisma.reviewLog.findMany({
      where: { userId, reviewedAt: { gte: rangeStartUtc } },
      select: { reviewedAt: true },
    });

    const countsByDate = new Map<string, number>();
    for (const log of logs) {
      const key = getDateKey(log.reviewedAt, tz);
      countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
    }

    const heatmap = heatmapDateKeys.map((date) => ({
      date,
      count: countsByDate.get(date) ?? 0,
    }));

    const streak = this.computeStreak(countsByDate, todayKey);

    const tomorrowKey = nextDateKey(todayKey);
    const tomorrowStartUtc = getLocalMidnightInUtc(tomorrowKey, tz);

    const [dueToday, activeStateGroups, totalKnown, courses] = await Promise.all([
      this.prisma.card.count({
        where: { userId, knownState: 'ACTIVE', due: { lt: tomorrowStartUtc } },
      }),
      this.prisma.card.groupBy({
        by: ['state'],
        where: { userId, knownState: 'ACTIVE' },
        _count: { _all: true },
      }),
      this.prisma.card.count({
        where: { userId, knownState: { in: ['AUTO_KNOWN', 'USER_KNOWN'] } },
      }),
      this.courses.listCourses(userId),
    ]);

    let totalNew = 0;
    let totalLearning = 0;
    for (const group of activeStateGroups) {
      if (group.state === 'NEW') totalNew += group._count._all;
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

  private computeStreak(countsByDate: Map<string, number>, todayKey: string): number {
    let cursor = todayKey;
    if (!countsByDate.has(cursor)) {
      cursor = prevDateKey(cursor);
    }

    let streak = 0;
    while (countsByDate.has(cursor)) {
      streak++;
      cursor = prevDateKey(cursor);
    }
    return streak;
  }
}

