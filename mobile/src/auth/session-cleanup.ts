import * as Notifications from 'expo-notifications';

import { ApiError } from '../api/errors';

import { useAuthStore } from './auth.store';
import { clearRefreshToken } from './token-storage';

let accountDataCleanup: (() => void | Promise<void>) | null = null;

export function registerAccountDataCleanup(
  cleanup: (() => void | Promise<void>) | null,
): void {
  accountDataCleanup = cleanup;
}

export async function clearLocalSession(): Promise<void> {
  useAuthStore.getState().clearSession();

  await Promise.allSettled([
    Notifications.cancelAllScheduledNotificationsAsync(),
    Promise.resolve().then(() => accountDataCleanup?.()),
  ]);

  try {
    await clearRefreshToken();
  } catch {
    try {
      await clearRefreshToken();
    } catch {
      throw new ApiError(
        'Your local session closed, but the saved credential could not be removed. Restart the app and sign out again.',
        'SECURE_STORAGE_CLEAR_FAILED',
        null,
        null,
        true,
      );
    }
  }
}
