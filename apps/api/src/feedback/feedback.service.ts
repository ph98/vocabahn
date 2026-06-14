import { Injectable, NotFoundException } from '@nestjs/common';
import type { EntryFeedback, SubmitFeedbackBody } from '@vocabahn/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveEntryId(word: string): Promise<{ id: string; word: string }> {
    const entry =
      (await this.prisma.dictionaryEntry.findFirst({ where: { word }, select: { id: true, word: true } })) ??
      (await this.prisma.dictionaryEntry.findFirst({
        where: { word: { equals: word, mode: 'insensitive' } },
        select: { id: true, word: true },
      }));
    if (!entry) {
      throw new NotFoundException(`No dictionary entry for "${word}"`);
    }
    return entry;
  }

  async getFeedback(word: string, userId: string): Promise<EntryFeedback> {
    const entry = await this.resolveEntryId(word);
    const feedback = await this.prisma.entryFeedback.findUnique({
      where: { entryId_userId: { entryId: entry.id, userId } },
      select: { vote: true, issues: true, comment: true },
    });
    return { vote: feedback?.vote ?? null, issues: feedback?.issues ?? [], comment: feedback?.comment ?? null };
  }

  async submitFeedback(
    word: string,
    userId: string,
    body: SubmitFeedbackBody,
    context: { userAgent?: string; locale?: string; path?: string },
  ): Promise<EntryFeedback> {
    const entry = await this.resolveEntryId(word);
    const feedback = await this.prisma.entryFeedback.upsert({
      where: { entryId_userId: { entryId: entry.id, userId } },
      create: {
        entryId: entry.id,
        userId,
        word: entry.word,
        vote: body.vote ?? null,
        issues: body.issues ?? [],
        comment: body.comment ?? null,
        userAgent: context.userAgent,
        locale: context.locale,
        path: context.path,
      },
      update: {
        vote: body.vote ?? null,
        issues: body.issues ?? [],
        comment: body.comment ?? null,
        userAgent: context.userAgent,
        locale: context.locale,
        path: context.path,
      },
      select: { vote: true, issues: true, comment: true },
    });
    return { vote: feedback.vote ?? null, issues: feedback.issues, comment: feedback.comment ?? null };
  }
}
