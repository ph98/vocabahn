import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { OAUTH_STATE_COOKIE, setOauthStateCookie, clearOauthStateCookie } from './cookies';
import type { Response } from 'express';

describe('AuthService & OAuth Cookies', () => {
  let authService: AuthService;

  const mockPrisma = {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    emailOtp: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockJwtService = {
    sign: vi.fn().mockReturnValue('mock_token'),
    verifyAsync: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'GOOGLE_CLIENT_ID') return 'mock-client-id';
      if (key === 'GOOGLE_CLIENT_SECRET') return 'mock-client-secret';
      if (key === 'GOOGLE_CALLBACK_URL') return 'http://localhost:3000/api/auth/google/redirect';
      if (key === 'FRONTEND_URL') return 'http://localhost:5173';
      return null;
    }),
    getOrThrow: vi.fn((key: string) => {
      if (key === 'GOOGLE_CLIENT_ID') return 'mock-client-id';
      if (key === 'GOOGLE_CLIENT_SECRET') return 'mock-client-secret';
      if (key === 'GOOGLE_CALLBACK_URL') return 'http://localhost:3000/api/auth/google/redirect';
      throw new Error(`Config ${key} missing`);
    }),
  };

  const mockEmailService = {
    sendMagicLink: vi.fn(),
  };

  const mockKnowledgeService = {
    batchGraduateFillers: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: mockEmailService },
        { provide: KnowledgeService, useValue: mockKnowledgeService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('setOauthStateCookie', () => {
    it('should set path to "/" so Google redirect callback receives state cookie', () => {
      const mockRes = {
        cookie: vi.fn(),
        clearCookie: vi.fn(),
      } as unknown as Response;

      setOauthStateCookie(mockRes, 'test-uuid-state');

      expect(mockRes.cookie).toHaveBeenCalledWith(
        OAUTH_STATE_COOKIE,
        'test-uuid-state',
        expect.objectContaining({ path: '/' })
      );
    });

    it('should clear state cookie with path "/"', () => {
      const mockRes = {
        cookie: vi.fn(),
        clearCookie: vi.fn(),
      } as unknown as Response;

      clearOauthStateCookie(mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        OAUTH_STATE_COOKIE,
        expect.objectContaining({ path: '/' })
      );
    });
  });

  describe('issueTokens', () => {
    it('should issue signed access and refresh tokens', () => {
      const result = authService.issueTokens('user-123');

      expect(result).toEqual({
        accessToken: 'mock_token',
        refreshToken: 'mock_token',
      });
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2);
    });
  });

  describe('refresh', () => {
    it('should throw UnauthorizedException for invalid token', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('Jwt expired'));

      await expect(authService.refresh('invalid_token')).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw UnauthorizedException if token type is not refresh', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'user-123',
        type: 'access',
      });

      await expect(authService.refresh('access_token')).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should rotate tokens and return user when valid refresh token is passed', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'user-123',
        type: 'refresh',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatarUrl: null,
        cefrLevel: 'B1.1',
      });

      const result = await authService.refresh('valid_refresh_token');

      expect(result.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatarUrl: null,
        cefrLevel: 'B1.1',
        // A user row predating the column reads back as no stated preference,
        // which the story picker treats as "any topic".
        interests: [],
      });
      expect(result.accessToken).toBe('mock_token');
      expect(result.refreshToken).toBe('mock_token');
    });
  });
});
