import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DecksController } from './decks.controller';
import { DecksService } from './decks.service';

@Module({
  imports: [PrismaModule],
  controllers: [DecksController],
  providers: [DecksService],
})
export class DecksModule {}
