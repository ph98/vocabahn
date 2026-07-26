import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@vocabahn/shared';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_TTL_MS, REFRESH_TTL_MS } from './cookies';
import { EmailService } from './email.service';

const OTP_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface JwtPayload {
  sub: string;
  type: 'access' | 'refresh';
}

@Injectable()
export class AuthService {
  private readonly google: OAuth2Client;
  private readonly clientId: string;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {
    this.clientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.google = new OAuth2Client(
      this.clientId,
      this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      this.config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
    );
  }

  buildAuthUrl(state: string): string {
    return this.google.generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      state,
    });
  }

  /** Web code flow: exchange the callback code, verify identity, upsert the user. */
  async signInWithCode(code: string): Promise<User> {
    const { tokens } = await this.google.getToken(code);
    if (!tokens.id_token) {
      throw new UnauthorizedException('Google did not return an ID token');
    }
    return this.signInWithIdToken(tokens.id_token);
  }

  /** Mobile-ready flow: verify a Google ID token directly. */
  async signInWithIdToken(idToken: string): Promise<User> {
    const ticket = await this.google
      .verifyIdToken({ idToken, audience: this.clientId })
      .catch(() => {
        throw new UnauthorizedException('Invalid Google ID token');
      });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException('Google account has no verified email');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ googleId: payload.sub }, { email: payload.email }],
      },
    });

    const user = existingUser
      ? await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            googleId: payload.sub,
            email: payload.email,
            name: payload.name ?? existingUser.name,
            avatarUrl: payload.picture ?? existingUser.avatarUrl,
          },
        })
      : await this.prisma.user.create({
          data: {
            googleId: payload.sub,
            email: payload.email,
            name: payload.name ?? null,
            avatarUrl: payload.picture ?? null,
          },
        });
    return this.toPublicUser(user);
  }

  issueTokens(userId: string): { accessToken: string; refreshToken: string } {
    return {
      accessToken: this.jwt.sign(
        { sub: userId, type: 'access' } satisfies JwtPayload,
        { expiresIn: `${ACCESS_TTL_MS / 1000}s` },
      ),
      refreshToken: this.jwt.sign(
        { sub: userId, type: 'refresh' } satisfies JwtPayload,
        { expiresIn: `${REFRESH_TTL_MS / 1000}s` },
      ),
    };
  }

  /** Verify a refresh token and rotate the pair. */
  async refresh(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: User;
  }> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Not a refresh token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return { ...this.issueTokens(user.id), user: this.toPublicUser(user) };
  }

  /**
   * Issues a time-limited OTP token and sends it as a magic link to the given address.
   * Always returns the same success message to avoid email-enumeration.
   */
  async requestEmailOtp(emailAddress: string): Promise<void> {
    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    // Invalidate any previous unused OTPs for this address
    await this.prisma.emailOtp.updateMany({
      where: { email: emailAddress, usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.prisma.emailOtp.create({ data: { email: emailAddress, token, expiresAt } });

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    const link = `${frontendUrl}/auth/verify?token=${token}`;
    await this.email.sendMagicLink(emailAddress, link);
  }

  /** Verifies the OTP token, upserts the user, and returns auth tokens. */
  async verifyEmailOtp(token: string): Promise<User> {
    const otp = await this.prisma.emailOtp.findUnique({ where: { token } });
    if (!otp || otp.usedAt || otp.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired link');
    }
    await this.prisma.emailOtp.update({ where: { id: otp.id }, data: { usedAt: new Date() } });

    const existingUser = await this.prisma.user.findUnique({
      where: { email: otp.email },
    });

    const user =
      existingUser ??
      (await this.prisma.user.create({
        data: {
          googleId: `email:${otp.email}`,
          email: otp.email,
          name: null,
          avatarUrl: null,
        },
      }));
    return this.toPublicUser(user);
  }

  async getUserById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user && this.toPublicUser(user);
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    cefrLevel: string | null;
  }): User {
    const { id, email, name, avatarUrl, cefrLevel } = user;
    return { id, email, name, avatarUrl, cefrLevel };
  }
}
