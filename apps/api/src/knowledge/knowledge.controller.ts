import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { KnownWordsResponse } from '@vocabahn/shared';
import { CurrentUserId, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KnowledgeService } from './knowledge.service';

@UseGuards(JwtAuthGuard)
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('known')
  async listKnown(@CurrentUserId() userId: string): Promise<KnownWordsResponse> {
    return { words: await this.knowledge.listKnownWords(userId) };
  }

  @Post('entry/:entryId/mark-known')
  async markKnown(@Param('entryId') entryId: string, @CurrentUserId() userId: string): Promise<{ success: true }> {
    await this.knowledge.markKnown(userId, entryId);
    return { success: true };
  }

  @Post('bulk-mark-known')
  async bulkMarkKnown(@Body() body: { dictionaryEntryIds: string[] }, @CurrentUserId() userId: string): Promise<{ success: true }> {
    await this.knowledge.bulkMarkKnown(userId, body.dictionaryEntryIds ?? []);
    return { success: true };
  }

  @Get('suggestions')
  async getSuggestions(@CurrentUserId() userId: string, @Query('limit') limitStr?: string) {
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    return this.knowledge.getSuggestions(userId, limit);
  }

  @Post('bulk-undo')
  async bulkUndo(@Body() body: { cardIds: string[] }, @CurrentUserId() userId: string): Promise<{ success: true }> {
    await this.knowledge.bulkUndo(userId, body.cardIds ?? []);
    return { success: true };
  }

  @Post(':cardId/undo')
  async undo(@Param('cardId') cardId: string, @CurrentUserId() userId: string): Promise<{ success: true }> {
    await this.knowledge.undoKnown(userId, cardId);
    return { success: true };
  }
}
