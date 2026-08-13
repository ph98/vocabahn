import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { DictionaryModule } from '../dictionary/dictionary.module';
import { ENRICHMENT_QUEUE } from './enrichment.constants';
import { EnrichmentProcessor } from './enrichment.processor';
import { EnrichmentService } from './enrichment.service';
import { GeminiProvider } from './providers/gemini.provider';
import { ImagesModule } from '../images/images.module';
import { TtsModule } from '../tts/tts.module';

import { StaticAudioController } from './static-audio.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: ENRICHMENT_QUEUE }),
    forwardRef(() => DictionaryModule),
    ImagesModule,
    TtsModule,
  ],
  controllers: [StaticAudioController],
  providers: [
    EnrichmentService,
    EnrichmentProcessor,
    GeminiProvider,
  ],
  exports: [EnrichmentService],
})
export class EnrichmentModule {}
