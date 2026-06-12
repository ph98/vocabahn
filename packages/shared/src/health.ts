import { z } from 'zod';

const serviceState = z.enum(['up', 'down']);

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  services: z.object({
    database: serviceState,
    redis: serviceState,
  }),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
