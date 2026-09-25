import { ApiError } from '../api/errors';
import { cancelAllScheduledNotifications } from '../platform/notifications/notification-runtime';

import { useAuthStore } from './auth.store';
import { clearRefreshToken } from './token-storage';

export async function clearLocalSession(): Promise<void> {
  useAuthStore.getState().clearSession();

  await Promise.allSettled([cancelAllScheduledNotifications()]);

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
