import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailService } from './email.service';
import type { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

vi.mock('nodemailer', () => ({
  createTransport: vi.fn(),
}));

describe('EmailService', () => {
  let mockConfig: Partial<ConfigService>;
  let sendMailMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    sendMailMock = vi.fn().mockResolvedValue({ messageId: 'msg-123' });
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: sendMailMock,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
  });

  it('logs to console and skips transporter when SMTP_HOST is unset', async () => {
    mockConfig = {
      get: vi.fn().mockReturnValue(undefined),
    };

    const service = new EmailService(mockConfig as ConfigService);
    await service.sendMagicLink('test@example.com', 'http://localhost/link');

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('configures nodemailer transporter and sends email when SMTP_HOST is set', async () => {
    mockConfig = {
      get: vi.fn((key: string) => {
        const env: Record<string, string> = {
          SMTP_HOST: 'smtp.example.com',
          SMTP_PORT: '587',
          SMTP_SECURE: 'true',
          SMTP_USER: 'user@example.com',
          SMTP_PASS: 'secret',
          SMTP_FROM: 'Vocabahn <noreply@vocabahn.com>',
        };
        return env[key];
      }),
    };

    const service = new EmailService(mockConfig as ConfigService);

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: true,
      auth: {
        user: 'user@example.com',
        pass: 'secret',
      },
    });

    await service.sendMagicLink('learner@example.com', 'https://vocabahn.app/auth/verify?token=abc');

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Vocabahn <noreply@vocabahn.com>',
        to: 'learner@example.com',
        subject: 'Your Vocabahn sign-in link',
        text: expect.stringContaining('https://vocabahn.app/auth/verify?token=abc'),
        html: expect.stringContaining('https://vocabahn.app/auth/verify?token=abc'),
      }),
    );
  });
});
