import { isRunningInExpoGo } from 'expo';
import * as Application from 'expo-application';
import * as Linking from 'expo-linking';
import { Linking as NativeLinking, PermissionsAndroid, Platform } from 'react-native';

import type { NotificationPermissionState } from '../../onboarding/types';
import {
  loadNotificationsModule,
  REMINDER_NOTIFICATION_CHANNEL_ID,
} from './notification-runtime';

type NotificationsModule = NonNullable<Awaited<ReturnType<typeof loadNotificationsModule>>>;
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
      await notifications.setNotificationChannelAsync(REMINDER_NOTIFICATION_CHANNEL_ID, {
        name: 'Reminders',
        description: 'Alerts for reminders you create in Smart Reminder.',
        audioAttributes: {
          usage: notifications.AndroidAudioUsage.ALARM,
          contentType: notifications.AndroidAudioContentType.SONIFICATION,
        },
        enableVibrate: true,
        importance: notifications.AndroidImportance.MAX,
        sound: 'default',
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

export async function openNotificationSoundSettings(channelId: string | null): Promise<void> {
  if (Platform.OS !== 'android' || !channelId || !Application.applicationId) {
    await openNotificationSettings();
    return;
  }

  try {
    await NativeLinking.sendIntent('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [
      { key: 'android.provider.extra.APP_PACKAGE', value: Application.applicationId },
      { key: 'android.provider.extra.CHANNEL_ID', value: channelId },
    ]);
  } catch {
    await openNotificationSettings();
  }
}

export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 31) {
    await openNotificationSettings();
    return;
  }

  try {
    await NativeLinking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');
  } catch {
    await openNotificationSettings();
  }
}

export function notificationPermissionAllowsAlerts(
  state: NotificationPermissionState,
): boolean {
  return state === 'granted' || state === 'provisional';
}
