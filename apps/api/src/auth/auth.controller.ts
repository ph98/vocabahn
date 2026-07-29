import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  Version,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  googleIdTokenSignInSchema,
  updateCefrLevelSchema,
  type AuthTokens,
  type GoogleIdTokenSignIn,
  type UpdateCefrLevelBody,
  type User,
} from '@vocabahn/shared';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import {
  clearAuthCookies,
  clearOauthStateCookie,
  OAUTH_STATE_COOKIE,
  REFRESH_COOKIE,
  setAuthCookies,
  setOauthStateCookie,
} from './cookies';
import { CurrentUserId, JwtAuthGuard } from './jwt-auth.guard';

// Stricter throttle tier for auth endpoints
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private get frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
  }

  /** Start the Google OAuth code flow (web). */
  @Get('google')
  startGoogleFlow(@Res() res: Response) {
    const state = randomUUID();
    setOauthStateCookie(res, state);
    res.redirect(this.auth.buildAuthUrl(state));
  }

  /**
   * Google redirects here. Version-neutral because this exact path
   * (/api/auth/google/redirect) is what's registered in the Google Console.
   */
  @Version(VERSION_NEUTRAL)
  @Get('google/redirect')
  async googleRedirect(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const cookies = (req.cookies as Record<string, string> | undefined) ?? {};
    const expectedState = cookies[OAUTH_STATE_COOKIE];
    clearOauthStateCookie(res);

    if (!code || !state || !expectedState || state !== expectedState) {
      res.redirect(`${this.frontendUrl}/?auth_error=state`);
      return;
    }

    try {
      const user = await this.auth.signInWithCode(code);
      setAuthCookies(res, this.auth.issueTokens(user.id));
      res.redirect(this.frontendUrl);
    } catch {
      res.redirect(`${this.frontendUrl}/?auth_error=google`);
    }
  }

  /** Mobile-ready sign-in: verify a Google ID token, return a JSON token pair. Reserved for native/mobile clients; uncalled by web app. */
  @Post('google/token')
  @HttpCode(200)
  async googleToken(
    @Body(new ZodValidationPipe(googleIdTokenSignInSchema))
    body: GoogleIdTokenSignIn,
  ): Promise<AuthTokens> {
    const user = await this.auth.signInWithIdToken(body.idToken);
    return { ...this.auth.issueTokens(user.id), user };
  }

  /** Web-ready sign-in: verify a Google One Tap credential (ID token), set cookies. */
  @Post('google/onetap')
  @HttpCode(200)
  async googleOneTap(
    @Body(new ZodValidationPipe(googleIdTokenSignInSchema))
    body: GoogleIdTokenSignIn,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    const user = await this.auth.signInWithIdToken(body.idToken);
    setAuthCookies(res, this.auth.issueTokens(user.id));
    return user;
  }

  /** Rotate the token pair. Web: refresh cookie; native: token in body. */
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { refreshToken?: string } | undefined,
  ): Promise<AuthTokens> {
    const cookies = (req.cookies as Record<string, string> | undefined) ?? {};
    const token = cookies[REFRESH_COOKIE] ?? body?.refreshToken;
    if (!token) {
      throw new UnauthorizedException('No refresh token');
    }
    const result = await this.auth.refresh(token);
    setAuthCookies(res, result);
    return result;
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookies(res);
  }

  /** Request a magic-link sign-in email. Always 204 to prevent email enumeration. */
  @Post('email/request')
  @HttpCode(204)
  async emailRequest(@Body() body: { email: string }): Promise<void> {
    if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return; // silently ignore malformed requests
    }
    await this.auth.requestEmailOtp(body.email.toLowerCase().trim());
  }

  /** Verify a magic-link token, set auth cookies, redirect to the app. */
  @Get('email/verify')
  async emailVerify(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      res.redirect(`${this.frontendUrl}/?auth_error=invalid_link`);
      return;
    }
    try {
      const user = await this.auth.verifyEmailOtp(token);
      setAuthCookies(res, this.auth.issueTokens(user.id));
      res.redirect(this.frontendUrl);
    } catch {
      res.redirect(`${this.frontendUrl}/?auth_error=invalid_link`);
    }
  }

  @Get(['me', '/me'])
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUserId() userId: string): Promise<User> {
    const user = await this.auth.getUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  @Patch('me/cefr')
  @UseGuards(JwtAuthGuard)
  async updateCefrLevel(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(updateCefrLevelSchema)) body: UpdateCefrLevelBody,
  ): Promise<User> {
    return this.auth.updateCefrLevel(userId, body.cefrLevel);
  }
}
