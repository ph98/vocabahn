import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { REMINDER_QUEUE } from './notifications.constants';
import { NotificationsService } from './notifications.service';
import { PushProvider } from './push.provider';
import { ReminderProcessor } from './reminder.processor';

@Module({
  imports: [BullModule.registerQueue({ name: REMINDER_QUEUE })],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushProvider, ReminderProcessor],
  exports: [NotificationsService, PushProvider],
})
export class NotificationsModule {}
