import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  EntryQuizResponse,
  QuizAttemptResult,
  QuizReport,
  SubmitQuizAttemptBody,
  SubmitQuizReportBody,
} from '@vocabahn/shared';
import { DictionaryService } from '../dictionary/dictionary.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Reports from this many distinct learners retire a question from the quiz.
 * Cheap self-healing: a bad question stops being served without anyone having
 * to triage it, and without spending another AI call to replace it.
 */
export const REPORT_SUPPRESS_THRESHOLD = 3;

/**
 * Serving and grading the per-word quiz.
 *
 * Nothing here touches `ReviewLog` or `Card`. `ReviewLog` is the FSRS source of
 * truth and is replayed from empty state by `CardsService.replayCard`, so a
 * quiz answer written there would silently reschedule the learner's card and
 * corrupt offline sync. Quiz answers live in `QuizAttempt` and nowhere else.
 */
@Injectable()
export class QuizService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dictionary: DictionaryService,
  ) {}

  /**
   * Questions for a headword, plus the entry's enrichment status so the client
   * can show its usual "enriching in the background" state instead of an empty
   * tab. Resolving through `findOrCreateEntry` keeps inflected forms working
   * (`Hunde` → `Hund`) and never spends enrichment quota.
   */
  async getQuiz(word: string, userId: string, pos?: string): Promise<EntryQuizResponse> {
    const resolved = await this.dictionary.findOrCreateEntry(word, pos);
    if (!resolved) {
      throw new NotFoundException(`No dictionary entry for "${word}"`);
    }

    const entry = await this.prisma.dictionaryEntry.findUnique({
      where: { id: resolved.id },
      select: { id: true, enrichmentStatus: true },
    });
    if (!entry) {
      throw new NotFoundException(`No dictionary entry for "${word}"`);
    }

    const questions = await this.prisma.entryQuizQuestion.findMany({
      where: {
        entryId: entry.id,
        reportCount: { lt: REPORT_SUPPRESS_THRESHOLD },
        // A question you reported is gone for you immediately, whatever anyone
        // else thinks of it.
        reports: { none: { userId } },
      },
      orderBy: { order: 'asc' },
      select: { id: true, type: true, prompt: true, options: true },
    });

    return {
      status: entry.enrichmentStatus,
      questions: questions.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        options: q.options,
      })),
    };
  }

  /**
   * Grades one answer server-side and records it. The correct index is not sent
   * to the client until it answers, and `correct` is computed here rather than
   * trusted from the request.
   */
  async submitAttempt(
    questionId: string,
    userId: string,
    body: SubmitQuizAttemptBody,
  ): Promise<QuizAttemptResult> {
    const question = await this.prisma.entryQuizQuestion.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        entryId: true,
        options: true,
        correctIndex: true,
        explanation: true,
      },
    });
    if (!question) {
      throw new NotFoundException('Quiz question not found');
    }
    if (body.selectedIndex >= question.options.length) {
      throw new BadRequestException('selectedIndex is out of range for this question');
    }

    const correct = body.selectedIndex === question.correctIndex;
    await this.prisma.quizAttempt.create({
      data: {
        questionId: question.id,
        entryId: question.entryId,
        userId,
        selectedIndex: body.selectedIndex,
        correct,
        latencyMs: body.latencyMs,
      },
    });

    return {
      correct,
      correctIndex: question.correctIndex,
      correctOption: question.options[question.correctIndex] ?? '',
      explanation: question.explanation,
    };
  }

  /**
   * "This question is wrong", one row per (question, user) — the same shape as
   * `EntryFeedback`, including the denormalized headword so AdminJS can browse
   * reports by word. Re-reporting updates the reason instead of inflating the
   * count.
   */
  async reportQuestion(
    questionId: string,
    userId: string,
    body: SubmitQuizReportBody,
    context: { userAgent?: string; locale?: string; path?: string },
  ): Promise<QuizReport> {
    const question = await this.prisma.entryQuizQuestion.findUnique({
      where: { id: questionId },
      select: { id: true, entry: { select: { word: true } } },
    });
    if (!question) {
      throw new NotFoundException('Quiz question not found');
    }

    const existing = await this.prisma.quizQuestionReport.findUnique({
      where: { questionId_userId: { questionId, userId } },
      select: { id: true },
    });

    const [report] = await this.prisma.$transaction([
      this.prisma.quizQuestionReport.upsert({
        where: { questionId_userId: { questionId, userId } },
        create: {
          questionId,
          userId,
          word: question.entry.word,
          reason: body.reason,
          comment: body.comment ?? null,
          userAgent: context.userAgent,
          locale: context.locale,
          path: context.path,
        },
        update: {
          reason: body.reason,
          comment: body.comment ?? null,
          userAgent: context.userAgent,
          locale: context.locale,
          path: context.path,
        },
        select: { reason: true, comment: true },
      }),
      ...(existing
        ? []
        : [
            this.prisma.entryQuizQuestion.update({
              where: { id: questionId },
              data: { reportCount: { increment: 1 } },
            }),
          ]),
    ]);

    return { reason: report.reason, comment: report.comment ?? null };
  }
}
