import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { submitFeedbackBodySchema, type EntryFeedback, type SubmitFeedbackBody } from '@vocabahn/shared';
import type { Request } from 'express';
import { CurrentUserId, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { FeedbackService } from './feedback.service';

@UseGuards(JwtAuthGuard)
@Controller('dictionary/:word/feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  getFeedback(@Param('word') word: string, @CurrentUserId() userId: string): Promise<EntryFeedback> {
    return this.feedback.getFeedback(word, userId);
  }

  @Post()
  submitFeedback(
    @Param('word') word: string,
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(submitFeedbackBodySchema)) body: SubmitFeedbackBody,
    @Req() req: Request,
  ): Promise<EntryFeedback> {
    return this.feedback.submitFeedback(word, userId, body, {
      userAgent: req.headers['user-agent'],
      locale: req.headers['accept-language']?.split(',')[0],
      path: req.headers.referer,
    });
  }
}
