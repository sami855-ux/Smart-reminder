import { Platform } from 'react-native';

export const REMINDER_NOTIFICATION_CHANNEL_ID = 'reminders-v3-default-standard';

export type NotificationsRuntime = Pick<
  typeof import('expo-notifications'),
  | 'AndroidImportance'
  | 'AndroidNotificationPriority'
  | 'DEFAULT_ACTION_IDENTIFIER'
  | 'IosAuthorizationStatus'
  | 'PermissionStatus'
  | 'SchedulableTriggerInputTypes'
  | 'addNotificationReceivedListener'
  | 'addNotificationResponseReceivedListener'
  | 'cancelAllScheduledNotificationsAsync'
  | 'cancelScheduledNotificationAsync'
  | 'getLastNotificationResponseAsync'
  | 'getPermissionsAsync'
  | 'requestPermissionsAsync'
  | 'scheduleNotificationAsync'
  | 'setNotificationCategoryAsync'
  | 'setNotificationChannelAsync'
  | 'setNotificationHandler'
>;

export function isNotificationRuntimeAvailable(): boolean {
  return Platform.OS !== 'web';
}

export async function loadNotificationsModule(): Promise<NotificationsRuntime | null> {
  if (!isNotificationRuntimeAvailable()) return null;

  try {
    // Import only the local-notification modules. The package entry also loads
    // push-token auto-registration, which throws in Android Expo Go even though
    // local scheduling remains supported there.
    const [
      permissions,
      permissionTypes,
      notificationTypes,
      channelTypes,
      channel,
      category,
      handler,
      scheduler,
      cancellation,
      cancellationAll,
      emitter,
    ] = await Promise.all([
      import('expo-notifications/build/NotificationPermissions'),
      import('expo-notifications/build/NotificationPermissions.types'),
      import('expo-notifications/build/Notifications.types'),
      import('expo-notifications/build/NotificationChannelManager.types'),
      import('expo-notifications/build/setNotificationChannelAsync'),
      import('expo-notifications/build/setNotificationCategoryAsync'),
      import('expo-notifications/build/NotificationsHandler'),
      import('expo-notifications/build/scheduleNotificationAsync'),
      import('expo-notifications/build/cancelScheduledNotificationAsync'),
      import('expo-notifications/build/cancelAllScheduledNotificationsAsync'),
      import('expo-notifications/build/NotificationsEmitter'),
    ]);

    return {
      AndroidImportance: channelTypes.AndroidImportance,
      AndroidNotificationPriority: notificationTypes.AndroidNotificationPriority,
      DEFAULT_ACTION_IDENTIFIER: emitter.DEFAULT_ACTION_IDENTIFIER,
      IosAuthorizationStatus: permissionTypes.IosAuthorizationStatus,
      PermissionStatus: notificationTypes.PermissionStatus,
      SchedulableTriggerInputTypes: notificationTypes.SchedulableTriggerInputTypes,
      addNotificationReceivedListener: emitter.addNotificationReceivedListener,
      addNotificationResponseReceivedListener: emitter.addNotificationResponseReceivedListener,
      cancelAllScheduledNotificationsAsync:
        cancellationAll.cancelAllScheduledNotificationsAsync,
      cancelScheduledNotificationAsync: cancellation.cancelScheduledNotificationAsync,
      getLastNotificationResponseAsync: emitter.getLastNotificationResponseAsync,
      getPermissionsAsync: permissions.getPermissionsAsync,
      requestPermissionsAsync: permissions.requestPermissionsAsync,
      scheduleNotificationAsync: scheduler.scheduleNotificationAsync,
      setNotificationCategoryAsync: category.setNotificationCategoryAsync,
      setNotificationChannelAsync: channel.setNotificationChannelAsync,
      setNotificationHandler: handler.setNotificationHandler,
    };
  } catch {
    return null;
  }
}

export async function cancelAllScheduledNotifications(): Promise<void> {
  const notifications = await loadNotificationsModule();
  if (!notifications) return;

  await notifications.cancelAllScheduledNotificationsAsync();
}
