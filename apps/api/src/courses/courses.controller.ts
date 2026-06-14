import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { CourseDetail, CourseListResponse, EnrollResponse } from '@vocabahn/shared';
import { CurrentUserId, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CoursesService } from './courses.service';

@UseGuards(JwtAuthGuard)
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  async list(@CurrentUserId() userId: string): Promise<CourseListResponse> {
    return { courses: await this.courses.listCourses(userId) };
  }

  @Get(':slug')
  getCourse(@Param('slug') slug: string, @CurrentUserId() userId: string): Promise<CourseDetail> {
    return this.courses.getCourse(userId, slug);
  }

  @Post(':slug/enroll')
  enroll(@Param('slug') slug: string, @CurrentUserId() userId: string): Promise<EnrollResponse> {
    return this.courses.enroll(userId, slug);
  }
}
