import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { CreateDeckBody, DeckDetail, DeckListResponse, DeckSummary, UpdateDeckBody } from '@vocabahn/shared';
import { CurrentUserId, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DecksService } from './decks.service';

@UseGuards(JwtAuthGuard)
@Controller('decks')
export class DecksController {
  constructor(private readonly decks: DecksService) {}

  @Get()
  list(@CurrentUserId() userId: string): Promise<DeckListResponse> {
    return this.decks.listDecks(userId);
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: CreateDeckBody): Promise<DeckSummary> {
    return this.decks.createDeck(userId, body);
  }

  @Get(':id')
  getDeck(@Param('id') id: string, @CurrentUserId() userId: string): Promise<DeckDetail> {
    return this.decks.getDeck(userId, id);
  }

  @Patch(':id')
  updateDeck(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
    @Body() body: UpdateDeckBody,
  ): Promise<DeckSummary> {
    return this.decks.updateDeck(userId, id, body);
  }

  @Delete(':id')
  async deleteDeck(@Param('id') id: string, @CurrentUserId() userId: string): Promise<{ deleted: true }> {
    await this.decks.deleteDeck(userId, id);
    return { deleted: true };
  }

  @Post(':id/words')
  addWord(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
    @Body() body: { entryId: string },
  ): Promise<{ added: true }> {
    return this.decks.addWord(userId, id, body.entryId);
  }

  @Delete(':id/words/:entryId')
  async removeWord(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @CurrentUserId() userId: string,
  ): Promise<{ removed: true }> {
    await this.decks.removeWord(userId, id, entryId);
    return { removed: true };
  }

  @Post(':id/import')
  importWords(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
    @Body() body: { words: string[] },
  ): Promise<{ imported: number, failed: string[] }> {
    return this.decks.importWords(userId, id, body.words);
  }
}
