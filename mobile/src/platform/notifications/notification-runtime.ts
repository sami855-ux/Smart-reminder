import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

export function isNotificationRuntimeAvailable(): boolean {
  // Importing the expo-notifications public entry point in Android Expo Go
  // initializes its removed push-token listener and throws. Permission checks
  // use a safe native fallback there; the full module is loaded in app builds.
  return Platform.OS !== 'web' && !isRunningInExpoGo();
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
