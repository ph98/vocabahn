import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { DictionaryModule } from '../dictionary/dictionary.module';
import { ENRICHMENT_QUEUE } from './enrichment.constants';
import { EnrichmentProcessor } from './enrichment.processor';
import { EnrichmentService } from './enrichment.service';
import { GeminiProvider } from './providers/gemini.provider';
import { TtsProvider } from './providers/tts.provider';
import { UnsplashProvider } from './providers/unsplash.provider';

@Module({
  imports: [
    BullModule.registerQueue({ name: ENRICHMENT_QUEUE }),
    forwardRef(() => DictionaryModule),
  ],
  providers: [
    EnrichmentService,
    EnrichmentProcessor,
    GeminiProvider,
    UnsplashProvider,
    TtsProvider,
  ],
  exports: [EnrichmentService],
})
export class EnrichmentModule {}
