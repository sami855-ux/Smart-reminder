import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { NotificationPermissionState } from '../onboarding/types';
import {
  listDeviceInstallations,
  registerDeviceInstallation,
  type DeviceInstallation,
} from './device.api';

const INSTALLATION_ID_KEY = 'smart-reminder:device-installation-id:v1';

function createUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/gu, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export async function getInstallationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
  if (existing) return existing;
  const created = createUuid();
  await AsyncStorage.setItem(INSTALLATION_ID_KEY, created);
  return created;
}

async function replaceInstallationId(): Promise<string> {
  const created = createUuid();
  await AsyncStorage.setItem(INSTALLATION_ID_KEY, created);
  return created;
}

function serverPermission(
  permission: NotificationPermissionState,
): DeviceInstallation['permissionState'] {
  switch (permission) {
    case 'granted':
      return 'GRANTED';
    case 'provisional':
      return 'PROVISIONAL';
    case 'denied':
    case 'blocked':
      return 'DENIED';
    default:
      return 'UNKNOWN';
  }
}

export async function syncCurrentDevice(input: {
  permission: NotificationPermissionState;
  locale: string;
  timezone: string;
}): Promise<DeviceInstallation | null> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  let installationId = await getInstallationId();
  const devices = await listDeviceInstallations();
  let existing = devices.find((device) => device.id === installationId);
  if (existing?.revokedAt) {
    installationId = await replaceInstallationId();
    existing = undefined;
  }

  return registerDeviceInstallation(installationId, {
    platform: Platform.OS === 'android' ? 'ANDROID' : 'IOS',
    appVersion: Constants.expoConfig?.version ?? '1.0.0',
    permissionState: serverPermission(input.permission),
    locale: input.locale,
    timezone: input.timezone,
    ...(existing ? { expectedRevision: existing.revision } : {}),
  });
}
