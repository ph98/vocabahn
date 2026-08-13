import { Body, Controller, Delete, Get, Post, Put, UseGuards } from '@nestjs/common';
import {
  pushSubscriptionSchema,
  unsubscribeSchema,
  updateNotificationSettingsSchema,
  type NotificationSettings,
  type PushSubscriptionBody,
  type UnsubscribeBody,
  type UpdateNotificationSettingsBody,
} from '@vocabahn/shared';
import { CurrentUserId, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

/**
 * The app's first server-backed settings surface. It is scoped to notifications
 * rather than named `/settings`, because the only setting that genuinely has to
 * live on the server is the one the server itself acts on — everything else is
 * still `localStorage` (`useSettings`), and generalising from one consumer
 * would be generalising from nothing.
 */
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('settings')
  getSettings(@CurrentUserId() userId: string): Promise<NotificationSettings> {
    return this.notifications.getSettings(userId);
  }

  @Put('settings')
  updateSettings(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(updateNotificationSettingsSchema))
    body: UpdateNotificationSettingsBody,
  ): Promise<NotificationSettings> {
    return this.notifications.updateSettings(userId, body);
  }

  /** Registers this browser. Called after the learner grants permission. */
  @Post('subscribe')
  subscribe(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(pushSubscriptionSchema)) body: PushSubscriptionBody,
  ): Promise<NotificationSettings> {
    return this.notifications.subscribe(userId, body);
  }

  /** Drops one device, or all of them when no endpoint is given. */
  @Delete('subscribe')
  unsubscribe(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(unsubscribeSchema)) body: UnsubscribeBody,
  ): Promise<NotificationSettings> {
    return this.notifications.unsubscribe(userId, body.endpoint);
  }
}
