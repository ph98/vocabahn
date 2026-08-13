import { Module } from '@nestjs/common';
import { DictionaryModule } from '../dictionary/dictionary.module';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';

@Module({
  imports: [DictionaryModule],
  controllers: [QuizController],
  providers: [QuizService],
})
export class QuizModule {}
