import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Environment } from '../../config/env.schema.js';

@Injectable()
export class AuthEmailService {
  private readonly logger = new Logger(AuthEmailService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly config: ConfigService<Environment, true>) {
    const smtpUrl = this.config.get('SMTP_URL', { infer: true });
    this.transporter = smtpUrl ? nodemailer.createTransport(smtpUrl) : null;
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendVerification(email: string, token: string): Promise<void> {
    await this.send(
      email,
      'Verify your Smart Reminder email',
      'verify-email',
      token,
      'Verify email',
    );
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    await this.send(
      email,
      'Reset your Smart Reminder password',
      'reset-password',
      token,
      'Reset password',
    );
  }

  private async send(
    email: string,
    subject: string,
    path: string,
    token: string,
    action: string,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('Transactional email is not configured; message was not sent.');
      return;
    }

    const baseUrl = this.config.get('AUTH_PUBLIC_APP_URL', { infer: true });
    const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    url.searchParams.set('token', token);

    try {
      await this.transporter.sendMail({
        from: this.config.get('SMTP_FROM', { infer: true }),
        to: email,
        subject,
        text: `${action}: ${url.toString()}\n\nIf you did not request this, ignore this message.`,
      });
    } catch (error) {
      this.logger.error('Transactional email delivery failed.', error instanceof Error ? error.stack : undefined);
      throw new ServiceUnavailableException('Account email could not be delivered. Please try again.');
    }
  }
}
