import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

export function isNotificationRuntimeAvailable(): boolean {
  // Expo Go does not support Android remote push delivery, but local
  // notification permission and scheduling APIs remain available.
  return Platform.OS !== 'web';
}

export async function loadNotificationsModule(): Promise<NotificationsModule | null> {
  if (!isNotificationRuntimeAvailable()) return null;

  return import('expo-notifications');
}

export async function cancelAllScheduledNotifications(): Promise<void> {
  const notifications = await loadNotificationsModule();
  if (!notifications) return;

  await notifications.cancelAllScheduledNotificationsAsync();
}
