import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@vocabahn/shared';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';

@Controller(['health', 'status'])
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get(['', '/status', '/health'])
  async check(): Promise<HealthResponse> {
    const checkDb = async (): Promise<'up' | 'down'> => {
      try {
        await this.prisma.$queryRaw`SELECT 1`;
        return 'up';
      } catch {
        return 'down';
      }
    };

    const checkRedis = async (): Promise<'up' | 'down'> => {
      try {
        await this.redis.ping();
        return 'up';
      } catch {
        return 'down';
      }
    };

    const [database, redis] = await Promise.all([checkDb(), checkRedis()]);

    return {
      status: database === 'up' && redis === 'up' ? 'ok' : 'degraded',
      services: { database, redis },
      timestamp: new Date().toISOString(),
    };
  }
}
