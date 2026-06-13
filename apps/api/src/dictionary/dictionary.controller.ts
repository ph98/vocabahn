import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  dictionarySearchQuerySchema,
  type DictionaryEntryDetail,
  type DictionarySearchResponse,
} from '@vocabahn/shared';
import { CurrentUserId, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DictionaryService } from './dictionary.service';

@UseGuards(JwtAuthGuard)
@Controller('dictionary')
export class DictionaryController {
  constructor(private readonly dictionary: DictionaryService) {}

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
