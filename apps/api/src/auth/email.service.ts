import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    if (!host) {
      this.logger.warn('SMTP_HOST not set — email sending disabled (OTP will be logged instead)');
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(config.get('SMTP_PORT') ?? 587),
      secure: config.get('SMTP_SECURE') === 'true',
      auth: {
        user: config.get<string>('SMTP_USER'),
        pass: config.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendMagicLink(to: string, link: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM') ?? 'Vocabahn <noreply@vocabahn.com>';
    const html = [
      '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">',
      '<h1 style="font-size:24px;margin-bottom:8px">Sign in to Vocabahn</h1>',
      '<p style="color:#666;margin-bottom:24px">Click the button below to sign in. The link expires in 15 minutes.</p>',
      `<a href="${link}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600">Sign in</a>`,
      '<p style="margin-top:24px;color:#999;font-size:13px">Or copy this link: <a href="${link}" style="color:#6366f1">${link}</a></p>',
      '<p style="margin-top:32px;color:#bbb;font-size:12px">If you didn\'t request this, ignore this email.</p>',
      '</div>',
    ].join('\n').replace(/\${link}/g, link);

    if (!this.transporter) {
      this.logger.log(`[DEV] Magic link for ${to}: ${link}`);
      return;
    }

    await this.transporter.sendMail({ from, to, subject: 'Your Vocabahn sign-in link', html });
    this.logger.log(`Sent magic link to ${to}`);
  }
}
