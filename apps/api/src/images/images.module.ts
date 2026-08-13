import { Module } from '@nestjs/common';
import { UnsplashProvider } from './unsplash.provider';

/**
 * Unsplash photo lookup, shared by dictionary enrichment (a square illustration
 * for a headword) and micro-stories (a landscape scene above the text).
 */
@Module({
  providers: [UnsplashProvider],
  exports: [UnsplashProvider],
})
export class ImagesModule {}
