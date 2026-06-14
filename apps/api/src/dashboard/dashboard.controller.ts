import { Controller, Get, UseGuards } from '@nestjs/common';
import type { DashboardResponse } from '@vocabahn/shared';
import { CurrentUserId, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  getDashboard(@CurrentUserId() userId: string): Promise<DashboardResponse> {
    return this.dashboard.getDashboard(userId);
  }
}
