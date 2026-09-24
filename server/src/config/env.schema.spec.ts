import { generateKeyPairSync } from 'node:crypto';
import { validateEnvironment } from './env.schema.js';

describe('validateEnvironment', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const valid = {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/smart_reminder',
    JWT_ACCESS_PRIVATE_KEY_BASE64: Buffer.from(privateKey).toString('base64'),
    JWT_ACCESS_PUBLIC_KEY_BASE64: Buffer.from(publicKey).toString('base64'),
    AUTH_AUDIT_PEPPER: 'test-pepper-that-is-at-least-32-characters',
  };

  it('applies safe defaults and parses numeric configuration', () => {
    const environment = validateEnvironment({
      ...valid,
      PORT: '3100',
      SWAGGER_ENABLED: 'false',
    });

    expect(environment.PORT).toBe(3100);
    expect(environment.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(environment.SWAGGER_ENABLED).toBe(false);
  });

  it('fails fast for a missing audit pepper', () => {
    expect(() =>
      validateEnvironment({
        ...valid,
        AUTH_AUDIT_PEPPER: undefined,
      }),
    ).toThrow('AUTH_AUDIT_PEPPER');
  });

  it('requires transactional email configuration in production', () => {
    expect(() => validateEnvironment({ ...valid, NODE_ENV: 'production' })).toThrow('SMTP_URL');
  });

  it('accepts blank optional SMTP values in a copied development env file', () => {
    expect(validateEnvironment({ ...valid, SMTP_URL: '', SMTP_FROM: '' }).SMTP_URL).toBeUndefined();
  });
});
