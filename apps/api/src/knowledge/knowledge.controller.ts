import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  calibrateDiagnosticBodySchema,
  updateCefrLevelSchema,
  type AutoGraduation,
  type CalibrateDiagnosticBody,
  type CalibrateDiagnosticResponse,
  type DiagnosticProbeResponse,
  type KnownWordsResponse,
  type UpdateCefrLevelBody,
  type User,
} from '@vocabahn/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
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

  @Get('diagnostic-probe')
  async getDiagnosticProbe(): Promise<DiagnosticProbeResponse> {
    return this.knowledge.getDiagnosticProbe();
  }

  @Post('calibrate-diagnostic')
  async calibrateDiagnostic(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(calibrateDiagnosticBodySchema)) body: CalibrateDiagnosticBody,
  ): Promise<CalibrateDiagnosticResponse> {
    return this.knowledge.calibrateDiagnostic(userId, body);
  }

  @Post('level')
  @Patch('level')
  async setLevel(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(updateCefrLevelSchema)) body: UpdateCefrLevelBody,
  ): Promise<{ user: User; graduation: AutoGraduation | null }> {
    return this.knowledge.setUserCefrLevel(userId, body.cefrLevel);
  }

  @Post('entry/:entryId/mark-known')
  async markKnown(@Param('entryId') entryId: string, @CurrentUserId() userId: string): Promise<{ success: true }> {
    await this.knowledge.markKnown(userId, entryId);
    return { success: true };
  }

  @Post('bulk-mark-known')
  async bulkMarkKnown(
    @Body() body: { dictionaryEntryIds: string[] },
    @CurrentUserId() userId: string,
  ): Promise<{ success: true }> {
    await this.knowledge.bulkMarkKnown(userId, body.dictionaryEntryIds ?? []);
    return { success: true };
  }

  @Get('suggestions')
  async getSuggestions(
    @CurrentUserId() userId: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
    @Query('cefrLevel') cefrLevel?: string,
    @Query('search') search?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;
    return this.knowledge.getSuggestions(userId, { limit, offset, cefrLevel, search });
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

