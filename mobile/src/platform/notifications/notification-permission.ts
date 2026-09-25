import { isRunningInExpoGo } from 'expo';
import * as Linking from 'expo-linking';
import { PermissionsAndroid, Platform } from 'react-native';

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

function createSnapshot(state: NotificationPermissionState): PermissionSnapshot {
  return { state, checkedAt: new Date().toISOString() };
}

function usesAndroidExpoGoFallback(): boolean {
  return Platform.OS === 'android' && isRunningInExpoGo();
}

async function readAndroidExpoGoPermission(): Promise<PermissionSnapshot> {
  if (Number(Platform.Version) < 33) return createSnapshot('granted');

  try {
    const granted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return createSnapshot(granted ? 'granted' : 'prompt-available');
  } catch {
    return createSnapshot('unavailable');
  }
}

async function requestAndroidExpoGoPermission(): Promise<PermissionSnapshot> {
  if (Number(Platform.Version) < 33) return createSnapshot('granted');

  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );

    if (result === PermissionsAndroid.RESULTS.GRANTED) {
      return createSnapshot('granted');
    }

    return createSnapshot(
      result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
        ? 'blocked'
        : 'denied',
    );
  } catch {
    return createSnapshot('unavailable');
  }
}

function normalizePermission(
  permission: NotificationPermissionsStatus,
  notifications: NotificationsModule,
): NotificationPermissionState {
  const iosStatus = permission.ios?.status;

  if (
    permission.granted ||
    iosStatus === notifications.IosAuthorizationStatus.AUTHORIZED
  ) {
    return 'granted';
  }

  if (
    iosStatus === notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === notifications.IosAuthorizationStatus.EPHEMERAL
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
  if (usesAndroidExpoGoFallback()) {
    return readAndroidExpoGoPermission();
  }

  return readPermission();
}

export async function requestNotificationPermission(): Promise<PermissionSnapshot> {
  if (usesAndroidExpoGoFallback()) {
    return requestAndroidExpoGoPermission();
  }

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
