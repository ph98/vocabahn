import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CardsModule } from './cards/cards.module';
import { CoursesModule } from './courses/courses.module';
import { DecksModule } from './decks/decks.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DictionaryModule } from './dictionary/dictionary.module';
import { EnrichmentModule } from './enrichment/enrichment.module';
import { FeedbackModule } from './feedback/feedback.module';
import { HealthModule } from './health/health.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { PrismaModule } from './prisma/prisma.module';
import { QuizModule } from './quiz/quiz.module';
import { RedisModule } from './redis/redis.module';
import { SourcesModule } from './sources/sources.module';
import { StoriesModule } from './stories/stories.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.get('REDIS_URL') ?? 'redis://localhost:6379');
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port) || 6379,
            password: url.password || undefined,
          },
        };
      },
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    CardsModule,
    CoursesModule,
    DecksModule,
    DashboardModule,
    DictionaryModule,
    EnrichmentModule,
    FeedbackModule,
    HealthModule,
    KnowledgeModule,
    QuizModule,
    SourcesModule,
    StoriesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
