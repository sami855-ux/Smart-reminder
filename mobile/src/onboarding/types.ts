export type TimeFormat = '12-hour' | '24-hour';

export type NotificationPermissionState =
  | 'unknown'
  | 'prompt-available'
  | 'granted'
  | 'provisional'
  | 'denied'
  | 'blocked'
  | 'unavailable';

export type OnboardingPreferences = {
  locale: string;
  timezone: string;
  timeFormat: TimeFormat;
};

export type OnboardingState = {
  completed: boolean;
  preferences: OnboardingPreferences;
  notificationPermission: NotificationPermissionState;
  permissionCheckedAt: string | null;
};
