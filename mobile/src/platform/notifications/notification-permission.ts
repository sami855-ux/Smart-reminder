import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import type { NotificationPermissionState } from '../../onboarding/types';
import { loadNotificationsModule } from './notification-runtime';

type NotificationsModule = typeof import('expo-notifications');
type NotificationPermissionsStatus = Awaited<
  ReturnType<NotificationsModule['getPermissionsAsync']>
>;

export type PermissionSnapshot = {
  state: NotificationPermissionState;
  checkedAt: string;
};

function normalizePermission(
  permission: NotificationPermissionsStatus,
  notifications: NotificationsModule,
): NotificationPermissionState {
  if (permission.granted) {
    return 'granted';
  }

  if (
    permission.ios?.status ===
    notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return 'provisional';
  }

  if (permission.status === notifications.PermissionStatus.UNDETERMINED) {
    return permission.canAskAgain ? 'prompt-available' : 'blocked';
  }

  return permission.canAskAgain ? 'denied' : 'blocked';
}

async function readPermission(): Promise<PermissionSnapshot> {
  const notifications = await loadNotificationsModule();
  if (!notifications) {
    return { state: 'unavailable', checkedAt: new Date().toISOString() };
  }

  try {
    const permission = await notifications.getPermissionsAsync();
    return {
      state: normalizePermission(permission, notifications),
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
  const notifications = await loadNotificationsModule();
  if (!notifications) return readPermission();

  try {
    if (Platform.OS === 'android') {
      await notifications.setNotificationChannelAsync('reminders', {
        name: 'Reminders',
        description: 'Alerts for reminders you create in Smart Reminder.',
        importance: notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 150, 250],
      });
    }

    const permission = await notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });

    return {
      state: normalizePermission(permission, notifications),
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
