import { z } from 'zod';

import { requestWithAccessToken } from '../api/client';
import { toApiError } from '../api/errors';

export const notificationPreferencesQueryKey = ['notification-preferences'] as const;

export const profilePreferencesSchema = z
  .object({
    userId: z.uuid(),
    locale: z.string(),
    timezone: z.string(),
    timeFormat: z.enum(['H12', 'H24']),
    revision: z.number().int().positive(),
  })
  .strict();

export const notificationPreferencesSchema = z
  .object({
    userId: z.uuid(),
    quietHoursStart: z.string().nullable(),
    quietHoursEnd: z.string().nullable(),
    timezone: z.string(),
    lockScreenPrivacy: z.enum(['FULL', 'TITLE_ONLY', 'PRIVATE']),
    globallyPaused: z.boolean(),
    revision: z.number().int().nonnegative(),
    createdAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime().nullable(),
  })
  .strict();

export type ProfilePreferences = z.infer<typeof profilePreferencesSchema>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export async function getProfilePreferences(): Promise<ProfilePreferences> {
  try {
    return await requestWithAccessToken(
      { method: 'GET', url: '/me/preferences' },
      profilePreferencesSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function updateProfilePreferences(input: {
  expectedRevision: number;
  locale: string;
  timezone: string;
  timeFormat: 'H12' | 'H24';
}): Promise<ProfilePreferences> {
  try {
    return await requestWithAccessToken(
      { method: 'PATCH', url: '/me/preferences', data: input },
      profilePreferencesSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    return await requestWithAccessToken(
      { method: 'GET', url: '/notification-preferences' },
      notificationPreferencesSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function updateNotificationPreferences(input: {
  expectedRevision: number;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  timezone?: string;
  lockScreenPrivacy?: 'FULL' | 'TITLE_ONLY' | 'PRIVATE';
  globallyPaused?: boolean;
}): Promise<NotificationPreferences> {
  try {
    return await requestWithAccessToken(
      { method: 'PATCH', url: '/notification-preferences', data: input },
      notificationPreferencesSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}
