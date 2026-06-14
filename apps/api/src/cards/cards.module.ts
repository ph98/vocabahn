import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';

@Module({
  imports: [KnowledgeModule],
  controllers: [CardsController],
  providers: [CardsService],
})
export class CardsModule {}
