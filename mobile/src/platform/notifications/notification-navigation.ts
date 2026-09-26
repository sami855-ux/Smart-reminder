import { useEffect } from 'react';
import { type Href, useRouter } from 'expo-router';

import { loadNotificationsModule } from './notification-runtime';

export function useNotificationNavigation(): void {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    let removeListener: (() => void) | null = null;

    function openUrl(value: unknown) {
      if (
        !active ||
        typeof value !== 'string' ||
        !value.startsWith('/reminders/')
      ) {
        return;
      }
      router.push(value as Href);
    }

    void loadNotificationsModule().then(async (notifications) => {
      if (!active || !notifications) return;
      const initial = await notifications.getLastNotificationResponseAsync();
      openUrl(initial?.notification.request.content.data?.url);
      const subscription = notifications.addNotificationResponseReceivedListener(
        (response) => openUrl(response.notification.request.content.data?.url),
      );
      removeListener = () => subscription.remove();
    });

    return () => {
      active = false;
      removeListener?.();
    };
  }, [router]);
}
