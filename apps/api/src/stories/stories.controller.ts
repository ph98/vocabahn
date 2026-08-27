import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  completeStoryBodySchema,
  createStoryBodySchema,
  storyInteractBodySchema,
  type CompleteStoryBody,
  type CompleteStoryResponse,
  type CreateStoryBody,
  type LatestStoryResponse,
  type StoryInteractBody,
  type StoryInteractResponse,
  type StoryQuota,
  type StoryResponse,
} from '@vocabahn/shared';
import { CurrentUserId, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { StoriesService } from './stories.service';

@UseGuards(JwtAuthGuard)
@Controller('stories')
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  // Declared before `:id` — Nest matches routes in declaration order.
  @Get('quota')
  getQuota(
    @CurrentUserId() userId: string,
    @Query('timezone') timezone?: string,
    @Query('format') format?: string,
  ): Promise<StoryQuota> {
    // Episodes have their own, smaller allowance — see `getQuota`.
    return this.stories.getQuota(userId, timezone, format === 'PODCAST' ? 'PODCAST' : 'TEXT');
  }

  /**
   * The learner's most recent unfinished story, or null. This is how a story
   * written overnight by the scheduler is found — the client that would have
   * remembered its id was closed at the time.
   */
  @Get('latest')
  async latest(@CurrentUserId() userId: string): Promise<LatestStoryResponse> {
    return { story: await this.stories.latest(userId) };
  }

  @Post()
  async create(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(createStoryBodySchema)) body: CreateStoryBody,
  ): Promise<StoryResponse> {
    return {
      story: await this.stories.create(
        userId,
        body.timezone,
        body.topic,
        'ON_DEMAND',
        body.prompt,
        body.format ?? 'TEXT',
      ),
    };
  }

  @Get(':id')
  async get(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<StoryResponse> {
    return { story: await this.stories.get(userId, id) };
  }

  @Post(':id/interact')
  async interact(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(storyInteractBodySchema)) body: StoryInteractBody,
  ): Promise<StoryInteractResponse> {
    return this.stories.interact(userId, id, body);
  }

  @Post(':id/complete')
  async complete(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(completeStoryBodySchema)) body: CompleteStoryBody,
  ): Promise<CompleteStoryResponse> {
    return this.stories.complete(userId, id, body);
  }
}

