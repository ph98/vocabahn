import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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

  @Post(':cardId/undo')
  async undo(@Param('cardId') cardId: string, @CurrentUserId() userId: string): Promise<{ success: true }> {
    await this.knowledge.undoKnown(userId, cardId);
    return { success: true };
  }
}
