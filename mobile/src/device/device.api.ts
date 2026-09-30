import { z } from 'zod';

import { requestWithAccessToken } from '../api/client';
import { toApiError } from '../api/errors';

export const deviceInstallationSchema = z
  .object({
    id: z.uuid(),
    platform: z.enum(['ANDROID', 'IOS']),
    appVersion: z.string(),
    permissionState: z.enum(['UNKNOWN', 'GRANTED', 'DENIED', 'PROVISIONAL', 'EPHEMERAL']),
    locale: z.string(),
    timezone: z.string(),
    revision: z.number().int().positive(),
    lastSeenAt: z.string().datetime(),
    revokedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const devicePageSchema = z.object({ items: z.array(deviceInstallationSchema) }).strict();

export type DeviceInstallation = z.infer<typeof deviceInstallationSchema>;

export async function listDeviceInstallations(): Promise<DeviceInstallation[]> {
  try {
    const page = await requestWithAccessToken(
      { method: 'GET', url: '/device-installations' },
      devicePageSchema,
    );
    return page.items;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function registerDeviceInstallation(
  installationId: string,
  input: {
    platform: 'ANDROID' | 'IOS';
    appVersion: string;
    permissionState: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'PROVISIONAL' | 'EPHEMERAL';
    locale: string;
    timezone: string;
    expectedRevision?: number;
  },
): Promise<DeviceInstallation> {
  try {
    return await requestWithAccessToken(
      { method: 'PUT', url: `/device-installations/${installationId}`, data: input },
      deviceInstallationSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function revokeDeviceInstallation(
  installationId: string,
): Promise<DeviceInstallation> {
  try {
    return await requestWithAccessToken(
      { method: 'DELETE', url: `/device-installations/${installationId}` },
      deviceInstallationSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}
