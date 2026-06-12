import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@vocabahn/shared';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(
        () => 'up' as const,
        () => 'down' as const,
      ),
      this.redis.ping().then(
        () => 'up' as const,
        () => 'down' as const,
      ),
    ]);

    return {
      status: database === 'up' && redis === 'up' ? 'ok' : 'degraded',
      services: { database, redis },
      timestamp: new Date().toISOString(),
    };
  }
}
