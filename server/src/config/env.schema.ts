import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const base64Pem = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine((value) => {
      try {
        return Buffer.from(value, 'base64').toString('utf8').includes('-----BEGIN');
      } catch {
        return false;
      }
    }, `${label} must be a base64-encoded PEM key`);

const optionalNonEmptyString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const optionalEmail = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().email().optional(),
);

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
      'DATABASE_URL must be a PostgreSQL connection URL',
    ),
  CORS_ORIGINS: z.string().default('http://localhost:8081'),
  TRUST_PROXY: booleanString,
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  JWT_ACCESS_PRIVATE_KEY_BASE64: base64Pem('JWT_ACCESS_PRIVATE_KEY_BASE64'),
  JWT_ACCESS_PUBLIC_KEY_BASE64: base64Pem('JWT_ACCESS_PUBLIC_KEY_BASE64'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
  JWT_ISSUER: z.string().min(3).max(120).default('smart-reminder-api'),
  JWT_AUDIENCE: z.string().min(3).max(120).default('smart-reminder-mobile'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().int().min(5).max(1_440).default(60),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  AUTH_AUDIT_PEPPER: z.string().min(32).max(512),
  AUTH_PUBLIC_APP_URL: z.url().default('http://localhost:8081'),
  SMTP_URL: optionalNonEmptyString,
  SMTP_FROM: optionalEmail,
}).superRefine((value, context) => {
  if (Boolean(value.SMTP_URL) !== Boolean(value.SMTP_FROM)) {
    context.addIssue({
      code: 'custom',
      path: ['SMTP_URL'],
      message: 'SMTP_URL and SMTP_FROM must be configured together',
    });
  }
  if (value.NODE_ENV === 'production' && (!value.SMTP_URL || !value.SMTP_FROM)) {
    context.addIssue({
      code: 'custom',
      path: ['SMTP_URL'],
      message: 'SMTP_URL and SMTP_FROM are required in production',
    });
  }
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    const reasons = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${reasons}`);
  }

  return result.data;
}

export function decodeBase64Pem(value: string): string {
  return Buffer.from(value, 'base64').toString('utf8');
}

export function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
