import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { NotificationPermissionState } from '../../onboarding/types';

export type PermissionSnapshot = {
  state: NotificationPermissionState;
  checkedAt: string;
};

function normalizePermission(
  permission: Notifications.NotificationPermissionsStatus,
): NotificationPermissionState {
  if (permission.granted) {
    return 'granted';
  }

  if (
    permission.ios?.status ===
    Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return 'provisional';
  }

  if (permission.status === Notifications.PermissionStatus.UNDETERMINED) {
    return permission.canAskAgain ? 'prompt-available' : 'blocked';
  }

  return permission.canAskAgain ? 'denied' : 'blocked';
}

async function readPermission(): Promise<PermissionSnapshot> {
  if (Platform.OS === 'web') {
    return { state: 'unavailable', checkedAt: new Date().toISOString() };
  }

  try {
    const permission = await Notifications.getPermissionsAsync();
    return {
      state: normalizePermission(permission),
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return { state: 'unavailable', checkedAt: new Date().toISOString() };
  }
}

export async function getNotificationPermission(): Promise<PermissionSnapshot> {
  return readPermission();
}

export async function requestNotificationPermission(): Promise<PermissionSnapshot> {
  if (Platform.OS === 'web') {
    return readPermission();
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      description: 'Alerts for reminders you create in Smart Reminder.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
    });
  }

  try {
    const permission = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });

    return {
      state: normalizePermission(permission),
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return { state: 'unavailable', checkedAt: new Date().toISOString() };
  }
}

export async function openNotificationSettings(): Promise<void> {
  await Linking.openSettings();
}

export function notificationPermissionAllowsAlerts(
  state: NotificationPermissionState,
): boolean {
  return state === 'granted' || state === 'provisional';
}
