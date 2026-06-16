import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  dictionarySearchQuerySchema,
  type DictionaryEntryDetail,
  type DictionarySearchResponse,
} from '@vocabahn/shared';
import { CurrentUserId, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EnrichmentService } from '../enrichment/enrichment.service';
import { DictionaryService } from './dictionary.service';

@UseGuards(JwtAuthGuard)
@Controller('dictionary')
export class DictionaryController {
  constructor(
    private readonly dictionary: DictionaryService,
    private readonly enrichment: EnrichmentService,
  ) {}

  @Get('quota')
  getQuota(@CurrentUserId() userId: string): Promise<{ used: number; cap: number }> {
    return this.enrichment.getQuota(userId);
  }

  /** Returns top-1000 enriched entries as a compact downloadable JSON for offline use. */
  @Get('offline-pack')
  async offlinePack(@Res() res: Response): Promise<void> {
    const entries = await this.dictionary.getOfflinePack();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="vocabahn-offline.json"');
    res.send(JSON.stringify({ generated: new Date().toISOString(), entries }));
  }

  @Get('search')
  search(
    @Query(new ZodValidationPipe(dictionarySearchQuerySchema))
    query: { q: string },
  ): DictionarySearchResponse {
    return { results: this.dictionary.search(query.q) };
  }

  @Get(':word')
  getEntry(
    @Param('word') word: string,
    @CurrentUserId() userId: string,
  ): Promise<DictionaryEntryDetail> {
    return this.dictionary.getEntry(word, userId);
  }
}
