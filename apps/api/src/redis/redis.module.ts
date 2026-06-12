import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () =>
        new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
          // Don't crash the app while Redis is unreachable; health reports it as down
          maxRetriesPerRequest: 1,
          lazyConnect: true,
        }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
