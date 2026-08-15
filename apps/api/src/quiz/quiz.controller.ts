import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  submitQuizAttemptBodySchema,
  submitQuizReportBodySchema,
  type EntryQuizResponse,
  type QuizAttemptResult,
  type QuizReport,
  type SubmitQuizAttemptBody,
  type SubmitQuizReportBody,
} from '@vocabahn/shared';
import type { Request } from 'express';
import { CurrentUserId, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { QuizService } from './quiz.service';

@UseGuards(JwtAuthGuard)
@Controller('dictionary')
export class QuizController {
  constructor(private readonly quiz: QuizService) {}

  @Get(':word/quiz')
  getQuiz(
    @Param('word') word: string,
    @CurrentUserId() userId: string,
    @Query('pos') pos?: string,
  ): Promise<EntryQuizResponse> {
    return this.quiz.getQuiz(word, userId, pos);
  }

  @Post('quiz/:questionId/attempt')
  submitAttempt(
    @Param('questionId') questionId: string,
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(submitQuizAttemptBodySchema)) body: SubmitQuizAttemptBody,
  ): Promise<QuizAttemptResult> {
    return this.quiz.submitAttempt(questionId, userId, body);
  }

  @Post('quiz/:questionId/report')
  reportQuestion(
    @Param('questionId') questionId: string,
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(submitQuizReportBodySchema)) body: SubmitQuizReportBody,
    @Req() req: Request,
  ): Promise<QuizReport> {
    return this.quiz.reportQuestion(questionId, userId, body, {
      userAgent: req.headers['user-agent'],
      locale: req.headers['accept-language']?.split(',')[0],
      path: req.headers.referer,
    });
  }
}
