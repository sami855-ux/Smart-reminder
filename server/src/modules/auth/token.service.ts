import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Environment } from '../../config/env.schema.js';
import { decodeBase64Pem } from '../../config/env.schema.js';
import type { AccessTokenPayload } from '../../common/auth/auth-principal.js';

export type OpaqueRefreshToken = {
  plainText: string;
  hash: string;
};

export type OpaqueActionToken = OpaqueRefreshToken;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  createRefreshToken(accountId?: string): OpaqueRefreshToken {
    const entropy = randomBytes(32).toString('base64url');
    const plainText = accountId ? `${accountId}.${entropy}` : entropy;
    return { plainText, hash: this.hashRefreshToken(plainText) };
  }

  createActionToken(accountId?: string): OpaqueActionToken {
    const entropy = randomBytes(32).toString('base64url');
    const plainText = accountId ? `${accountId}.${entropy}` : entropy;
    return { plainText, hash: this.hashActionToken(plainText) };
  }

  hashActionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  emailVerificationExpiresAt(from = new Date()): Date {
    const minutes = this.config.get('EMAIL_VERIFICATION_TTL_MINUTES', { infer: true });
    return new Date(from.getTime() + minutes * 60_000);
  }

  passwordResetExpiresAt(from = new Date()): Date {
    const minutes = this.config.get('PASSWORD_RESET_TTL_MINUTES', { infer: true });
    return new Date(from.getTime() + minutes * 60_000);
  }

  hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  refreshTokenExpiresAt(from = new Date()): Date {
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    return new Date(from.getTime() + days * 24 * 60 * 60 * 1_000);
  }

  accessTokenExpiresInSeconds(): number {
    return this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  async signAccessToken(userId: string, sessionId: string): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: userId,
      sid: sessionId,
      jti: randomUUID(),
      typ: 'access',
    };

    return this.jwt.signAsync(payload, {
      algorithm: 'RS256',
      privateKey: decodeBase64Pem(
        this.config.get('JWT_ACCESS_PRIVATE_KEY_BASE64', { infer: true }),
      ),
      issuer: this.config.get('JWT_ISSUER', { infer: true }),
      audience: this.config.get('JWT_AUDIENCE', { infer: true }),
      expiresIn: this.accessTokenExpiresInSeconds(),
    });
  }
}
