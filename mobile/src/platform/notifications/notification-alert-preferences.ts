import AsyncStorage from '@react-native-async-storage/async-storage';

export const notificationAlertPreferencesQueryKey = [
  'notification-alert-preferences',
] as const;

const STORAGE_KEY = 'smart-reminder.notification-alert-preferences.v1';

export type ReminderSound = 'DEFAULT' | 'SILENT';
export type ReminderVibration = 'OFF' | 'SHORT' | 'STANDARD' | 'STRONG';
export type ReminderAlertStyle = 'ALARM' | 'NOTIFICATION';

export type NotificationAlertPreferences = {
  sound: ReminderSound;
  vibration: ReminderVibration;
  alertStyle: ReminderAlertStyle;
};

export const DEFAULT_NOTIFICATION_ALERT_PREFERENCES: NotificationAlertPreferences = {
  sound: 'DEFAULT',
  vibration: 'STANDARD',
  alertStyle: 'ALARM',
};

export async function getNotificationAlertPreferences(): Promise<NotificationAlertPreferences> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return DEFAULT_NOTIFICATION_ALERT_PREFERENCES;

  try {
    const value = JSON.parse(stored) as Partial<NotificationAlertPreferences>;
    return {
      sound: isReminderSound(value.sound)
        ? value.sound
        : DEFAULT_NOTIFICATION_ALERT_PREFERENCES.sound,
      vibration: isReminderVibration(value.vibration)
        ? value.vibration
        : DEFAULT_NOTIFICATION_ALERT_PREFERENCES.vibration,
      alertStyle: isReminderAlertStyle(value.alertStyle)
        ? value.alertStyle
        : DEFAULT_NOTIFICATION_ALERT_PREFERENCES.alertStyle,
    };
  } catch {
    return DEFAULT_NOTIFICATION_ALERT_PREFERENCES;
  }
}

export async function updateNotificationAlertPreferences(
  patch: Partial<NotificationAlertPreferences>,
): Promise<NotificationAlertPreferences> {
  const current = await getNotificationAlertPreferences();
  const updated = { ...current, ...patch };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function notificationChannelId(
  preferences: Pick<NotificationAlertPreferences, 'sound' | 'vibration'>,
): string {
  return `reminders-v3-${preferences.sound.toLowerCase()}-${preferences.vibration.toLowerCase()}`;
}

export function notificationVibrationPattern(
  vibration: ReminderVibration,
): number[] | null {
  switch (vibration) {
    case 'OFF':
      return null;
    case 'SHORT':
      return [0, 180];
    case 'STRONG':
      return [0, 500, 180, 500, 180, 700];
    case 'STANDARD':
    default:
      return [0, 250, 150, 250];
  }
}

function isReminderSound(value: unknown): value is ReminderSound {
  return value === 'DEFAULT' || value === 'SILENT';
}

function isReminderVibration(value: unknown): value is ReminderVibration {
  return value === 'OFF' || value === 'SHORT' || value === 'STANDARD' || value === 'STRONG';
}

function isReminderAlertStyle(value: unknown): value is ReminderAlertStyle {
  return value === 'ALARM' || value === 'NOTIFICATION';
}
