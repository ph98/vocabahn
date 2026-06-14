import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [CoursesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
