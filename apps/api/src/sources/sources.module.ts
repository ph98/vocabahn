import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SourceProcessor } from './source.processor';
import { SOURCE_QUEUE } from './sources.constants';
import { SourcesService } from './sources.service';

@Module({
  imports: [BullModule.registerQueue({ name: SOURCE_QUEUE })],
  providers: [SourcesService, SourceProcessor],
  exports: [SourcesService],
})
export class SourcesModule {}
