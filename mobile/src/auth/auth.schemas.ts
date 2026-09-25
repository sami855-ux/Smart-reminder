import { z } from 'zod';

export const authUserSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    emailVerifiedAt: z.string().datetime().nullable(),
  })
  .strict();

export const authResponseSchema = z
  .object({
    accessToken: z.string().min(1),
    // Refresh tokens are opaque credentials. Validate only the server's size
    // contract so the client does not depend on their internal encoding.
    refreshToken: z.string().min(43).max(128),
    accessTokenExpiresInSeconds: z.number().int().positive(),
    refreshTokenExpiresAt: z.string().datetime(),
    user: authUserSchema,
  })
  .strict();

export const apiErrorEnvelopeSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().min(1).optional(),
    retryable: z.boolean().optional(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .passthrough();

export const accountDeletionResponseSchema = z
  .object({
    status: z.literal('DELETION_PENDING'),
    purgeAfter: z.string().datetime(),
    cancelLocalNotifications: z.literal(true),
    localSignOutRequired: z.literal(true),
  })
  .strict();

export const exportResponseSchema = z
  .object({
    format: z.literal('smart-reminder-export'),
    version: z.literal(1),
    exportedAt: z.string().datetime(),
    account: z.object({
      id: z.uuid(),
      email: z.email(),
      emailVerifiedAt: z.string().datetime().nullable(),
      createdAt: z.string().datetime(),
    }),
    reminders: z.array(z.unknown()),
    note: z.string().optional(),
  })
  .passthrough();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320, 'Email must be 320 characters or fewer.')
  .pipe(z.email('Enter a valid email address.'));

export const loginFormSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, 'Enter your password.')
    .max(128, 'Password must be 128 characters or fewer.'),
});

export const registerFormSchema = z
  .object({
    email: emailSchema,
    password: z
      .string()
      .min(12, 'Use at least 12 characters.')
      .max(128, 'Password must be 128 characters or fewer.'),
    confirmPassword: z.string().min(1, 'Confirm your password.'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const forgotPasswordFormSchema = z.object({ email: emailSchema });

export const resetPasswordFormSchema = z
  .object({
    newPassword: z
      .string()
      .min(12, 'Use at least 12 characters.')
      .max(128, 'Password must be 128 characters or fewer.'),
    confirmPassword: z.string().min(1, 'Confirm your password.'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const confirmPasswordFormSchema = z.object({
  password: z
    .string()
    .min(1, 'Enter your password to continue.')
    .max(128, 'Password must be 128 characters or fewer.'),
});

export const actionTokenSchema = z
  .string()
  .min(32, 'This link is invalid or incomplete.')
  .max(256, 'This link is invalid or incomplete.');

export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type LoginForm = z.infer<typeof loginFormSchema>;
export type RegisterForm = z.infer<typeof registerFormSchema>;
export type ForgotPasswordForm = z.infer<typeof forgotPasswordFormSchema>;
export type ResetPasswordForm = z.infer<typeof resetPasswordFormSchema>;
export type ConfirmPasswordForm = z.infer<typeof confirmPasswordFormSchema>;
export type AccountExport = z.infer<typeof exportResponseSchema>;
