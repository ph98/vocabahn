import { z } from 'zod';
import { courseSummarySchema } from './course.js';

export const heatmapEntrySchema = z.object({
  date: z.string(),
  count: z.number(),
});
export type HeatmapEntry = z.infer<typeof heatmapEntrySchema>;

export const dashboardStatsSchema = z.object({
  dueToday: z.number(),
  reviewedToday: z.number(),
  totalKnown: z.number(),
  totalLearning: z.number(),
  totalNew: z.number(),
});
export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

export const dashboardResponseSchema = z.object({
  streak: z.number(),
  heatmap: z.array(heatmapEntrySchema),
  stats: dashboardStatsSchema,
  courses: z.array(courseSummarySchema),
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
