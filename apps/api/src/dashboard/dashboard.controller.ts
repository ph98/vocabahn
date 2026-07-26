import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { dashboardQuerySchema, type DashboardQuery, type DashboardResponse } from '@vocabahn/shared';
import { CurrentUserId, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  getDashboard(
    @CurrentUserId() userId: string,
    @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery,
  ): Promise<DashboardResponse> {
    return this.dashboard.getDashboard(userId, query.timezone);
  }
}

