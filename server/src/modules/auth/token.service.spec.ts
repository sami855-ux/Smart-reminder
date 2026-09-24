import { generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Environment } from '../../config/env.schema.js';
import type { AccessTokenPayload } from '../../common/auth/auth-principal.js';
import { TokenService } from './token.service.js';

describe('TokenService', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const values = {
    JWT_ACCESS_PRIVATE_KEY_BASE64: Buffer.from(privateKey).toString('base64'),
    JWT_ACCESS_PUBLIC_KEY_BASE64: Buffer.from(publicKey).toString('base64'),
    JWT_ACCESS_TTL_SECONDS: 900,
    JWT_ISSUER: 'smart-reminder-api-test',
    JWT_AUDIENCE: 'smart-reminder-mobile-test',
    REFRESH_TOKEN_TTL_DAYS: 30,
  } as Environment;
  const jwt = new JwtService();
  const service = new TokenService(
    jwt,
    new ConfigService<Environment, true>(values),
  );

  it('creates an opaque refresh token and only exposes its deterministic hash', () => {
    const token = service.createRefreshToken();

    expect(token.plainText).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(service.hashRefreshToken(token.plainText)).toBe(token.hash);
    expect(token.hash).not.toContain(token.plainText);
  });

  it('binds new opaque credentials to an account identifier for account rate limiting', () => {
    const accountId = '10000000-0000-4000-8000-000000000001';
    const refresh = service.createRefreshToken(accountId);
    const action = service.createActionToken(accountId);

    expect(refresh.plainText).toMatch(new RegExp(`^${accountId}\\.`));
    expect(action.plainText).toMatch(new RegExp(`^${accountId}\\.`));
    expect(refresh.hash).not.toContain(accountId);
    expect(action.hash).not.toContain(accountId);
  });

  it('signs a short-lived RS256 access token with constrained claims', async () => {
    const accessToken = await service.signAccessToken('user-id', 'session-id');
    const payload = await jwt.verifyAsync<AccessTokenPayload>(accessToken, {
      algorithms: ['RS256'],
      publicKey,
      issuer: values.JWT_ISSUER,
      audience: values.JWT_AUDIENCE,
    });

    expect(payload).toMatchObject({
      sub: 'user-id',
      sid: 'session-id',
      typ: 'access',
    });
    expect(payload.jti).toBeTruthy();
  });
});
