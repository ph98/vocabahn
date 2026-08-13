import { Module } from '@nestjs/common';
import { TtsProvider } from './tts.provider';

/**
 * German speech synthesis, shared by dictionary enrichment (headwords and
 * example sentences) and micro-stories (whole-story narration).
 */
@Module({
  providers: [TtsProvider],
  exports: [TtsProvider],
})
export class TtsModule {}
