import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ImagesModule } from '../images/images.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { SourcesModule } from '../sources/sources.module';
import { TtsModule } from '../tts/tts.module';
import { StoryProvider } from './providers/story.provider';
import { StoriesController } from './stories.controller';
import { STORY_DIGEST_QUEUE, STORY_QUEUE } from './stories.constants';
import { StoriesService } from './stories.service';
import { StoryDigestProcessor } from './story-digest.processor';
import { StoryProcessor } from './story.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: STORY_QUEUE }, { name: STORY_DIGEST_QUEUE }),
    ImagesModule,
    KnowledgeModule,
    SourcesModule,
    TtsModule,
  ],
  controllers: [StoriesController],
  providers: [StoriesService, StoryProcessor, StoryDigestProcessor, StoryProvider],
})
export class StoriesModule {}
