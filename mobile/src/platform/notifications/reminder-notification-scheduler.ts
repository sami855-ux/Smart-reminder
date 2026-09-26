import { Platform } from 'react-native';

import type { ReminderDetail } from '../../reminders/reminder.schemas';
import { loadNotificationsModule } from './notification-runtime';

export type ReminderSchedulingResult =
  | { status: 'scheduled'; count: number }
  | { status: 'unavailable'; count: 0 }
  | { status: 'failed'; count: number };

export async function scheduleReminderNotifications(
  reminder: ReminderDetail,
): Promise<ReminderSchedulingResult> {
  const notifications = await loadNotificationsModule();
  if (!notifications) return { status: 'unavailable', count: 0 };

  try {
    notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    if (Platform.OS === 'android') {
      await notifications.setNotificationChannelAsync('reminders', {
        name: 'Reminders',
        description: 'Alerts for reminders you create in Smart Reminder.',
        importance: notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 150, 250],
      });
    }

    let scheduled = 0;
    for (const occurrence of reminder.occurrences) {
      const identifier = `occurrence:${occurrence.id}:r${occurrence.scheduleRevision}`;
      if (
        occurrence.lifecycle !== 'SCHEDULED' ||
        new Date(occurrence.effectiveScheduledAt).getTime() <= Date.now()
      ) {
        await notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
        continue;
      }

      await notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
      await notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: reminder.title,
          body: reminder.contextNote ?? 'Your reminder is due now.',
          sound: 'default',
          data: {
            url: `/reminders/${reminder.id}?occurrenceId=${occurrence.id}`,
            reminderId: reminder.id,
            occurrenceId: occurrence.id,
            scheduleRevision: occurrence.scheduleRevision,
          },
        },
        trigger: {
          type: notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(occurrence.effectiveScheduledAt),
          ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
        },
      });
      scheduled += 1;
    }

    return { status: 'scheduled', count: scheduled };
  } catch {
    return { status: 'failed', count: 0 };
  }
}
