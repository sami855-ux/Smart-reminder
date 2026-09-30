import { Platform } from 'react-native';

import { getInstallationId } from '../../device/device-installation';
import {
  notificationAttemptKey,
  reportNotificationAttempt,
} from '../../device/notification-attempt.api';
import { getNotificationPreferences } from '../../preferences/preferences.api';
import {
  getNudgePolicy,
  getReminder,
  listReminderOccurrences,
} from '../../reminders/reminder.api';
import type { ReminderDetail } from '../../reminders/reminder.schemas';
import { loadNotificationsModule } from './notification-runtime';

type NotificationsModule = NonNullable<Awaited<ReturnType<typeof loadNotificationsModule>>>;
type Occurrence = ReminderDetail['occurrences'][number];

export const REMINDER_NOTIFICATION_CATEGORY = 'reminder_actions';
export const COMPLETE_NOTIFICATION_ACTION = 'complete_reminder';
export const SNOOZE_NOTIFICATION_ACTION = 'snooze_reminder_10';

export type ReminderSchedulingResult =
  | { status: 'scheduled'; count: number }
  | { status: 'paused'; count: 0 }
  | { status: 'unavailable'; count: 0 }
  | { status: 'failed'; count: number };

export async function scheduleReminderNotifications(
  reminder: ReminderDetail,
): Promise<ReminderSchedulingResult> {
  const notifications = await loadNotificationsModule();
  if (!notifications) return { status: 'unavailable', count: 0 };

  try {
    const installationId = await getInstallationId();
    const [preferences, nudgePolicy] = await Promise.all([
      getNotificationPreferences().catch(() => null),
      getNudgePolicy(reminder.id).catch(() => null),
    ]);
    configureNotificationHandler(notifications);
    await ensureAndroidChannel(notifications);
    await ensureReminderNotificationCategory(notifications);

    if (preferences?.globallyPaused) {
      await cancelReminderNotifications(reminder);
      return { status: 'paused', count: 0 };
    }

    let scheduled = 0;
    let failed = 0;
    for (const occurrence of reminder.occurrences) {
      const identifiers = notificationIdentifiers(occurrence);
      if (
        occurrence.lifecycle !== 'SCHEDULED' ||
        new Date(occurrence.effectiveScheduledAt).getTime() <= Date.now()
      ) {
        await cancelIdentifiers(notifications, identifiers);
        continue;
      }

      await cancelIdentifiers(notifications, identifiers);
      const baseResult = await scheduleOne({
        notifications,
        installationId,
        reminder,
        occurrence,
        nudgeStep: 0,
        date: applyQuietHours(new Date(occurrence.effectiveScheduledAt), preferences),
        identifier: identifiers.base,
        title: notificationTitle(reminder, preferences?.lockScreenPrivacy),
        body: notificationBody(reminder, preferences?.lockScreenPrivacy),
      });
      scheduled += baseResult ? 1 : 0;
      failed += baseResult ? 0 : 1;

      if (nudgePolicy?.enabled && nudgePolicy.intervalMinutes) {
        const nudgeAt = new Date(
          new Date(occurrence.effectiveScheduledAt).getTime() +
            nudgePolicy.intervalMinutes * 60_000,
        );
        const nudgeResult = await scheduleOne({
          notifications,
          installationId,
          reminder,
          occurrence,
          nudgeStep: 1,
          date: applyQuietHours(nudgeAt, preferences),
          identifier: identifiers.nudge,
          title:
            preferences?.lockScreenPrivacy === 'PRIVATE'
              ? 'Smart Reminder'
              : `Still pending: ${reminder.title}`,
          body: notificationBody(reminder, preferences?.lockScreenPrivacy),
        });
        scheduled += nudgeResult ? 1 : 0;
        failed += nudgeResult ? 0 : 1;
      }
    }

    return failed > 0
      ? { status: 'failed', count: scheduled }
      : { status: 'scheduled', count: scheduled };
  } catch {
    return { status: 'failed', count: 0 };
  }
}

export async function cancelReminderNotifications(
  reminder: ReminderDetail,
): Promise<void> {
  const notifications = await loadNotificationsModule();
  if (!notifications) return;
  const installationId = await getInstallationId();
  await Promise.all(
    reminder.occurrences.flatMap((occurrence) => {
      const identifiers = notificationIdentifiers(occurrence);
      return ([0, 1] as const).map(async (nudgeStep) => {
        const identifier = nudgeStep === 0 ? identifiers.base : identifiers.nudge;
        await notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
        void reportNotificationAttempt(
          {
            occurrenceId: occurrence.id,
            deviceInstallationId: installationId,
            scheduleRevision: occurrence.scheduleRevision,
            effectiveScheduledAt: occurrence.effectiveScheduledAt,
            nudgeStep,
            outcome: 'CANCELLED',
          },
          notificationAttemptKey(occurrence.id, 'CANCELLED', nudgeStep),
        ).catch(() => undefined);
      });
    }),
  );
}

export async function reconcileReminderNotifications(): Promise<{
  reminders: number;
  scheduled: number;
}> {
  const from = new Date();
  from.setDate(from.getDate() - 90);
  const to = new Date();
  to.setDate(to.getDate() + 366);
  const reminderIds = new Set<string>();
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const page = await listReminderOccurrences({
      view: 'ALL',
      from: from.toISOString(),
      to: to.toISOString(),
      limit: 50,
      ...(cursor ? { cursor } : {}),
    });
    for (const item of page.items) reminderIds.add(item.reminderId);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  let scheduled = 0;
  for (const reminderId of reminderIds) {
    const reminder = await getReminder(reminderId);
    const result = await scheduleReminderNotifications(reminder);
    scheduled += result.count;
  }
  return { reminders: reminderIds.size, scheduled };
}

async function scheduleOne({
  notifications,
  installationId,
  reminder,
  occurrence,
  nudgeStep,
  date,
  identifier,
  title,
  body,
}: {
  notifications: NotificationsModule;
  installationId: string;
  reminder: ReminderDetail;
  occurrence: Occurrence;
  nudgeStep: 0 | 1;
  date: Date;
  identifier: string;
  title: string;
  body: string;
}): Promise<boolean> {
  try {
    await notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title,
        body,
        sound: 'default',
        categoryIdentifier: REMINDER_NOTIFICATION_CATEGORY,
        data: {
          url: `/reminders/${reminder.id}?occurrenceId=${occurrence.id}`,
          reminderId: reminder.id,
          occurrenceId: occurrence.id,
          scheduleRevision: occurrence.scheduleRevision,
          effectiveScheduledAt: occurrence.effectiveScheduledAt,
          nudgeStep,
        },
      },
      trigger: {
        type: notifications.SchedulableTriggerInputTypes.DATE,
        date,
        ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
      },
    });
    void reportNotificationAttempt(
      {
        occurrenceId: occurrence.id,
        deviceInstallationId: installationId,
        scheduleRevision: occurrence.scheduleRevision,
        effectiveScheduledAt: occurrence.effectiveScheduledAt,
        nudgeStep,
        outcome: 'LOCALLY_SCHEDULED',
        osNotificationId: identifier,
      },
      notificationAttemptKey(occurrence.id, 'LOCALLY_SCHEDULED', nudgeStep),
    ).catch(() => undefined);
    return true;
  } catch {
    void reportNotificationAttempt(
      {
        occurrenceId: occurrence.id,
        deviceInstallationId: installationId,
        scheduleRevision: occurrence.scheduleRevision,
        effectiveScheduledAt: occurrence.effectiveScheduledAt,
        nudgeStep,
        outcome: 'SCHEDULING_FAILED',
        errorCode: 'LOCAL_SCHEDULE_FAILED',
      },
      notificationAttemptKey(occurrence.id, 'SCHEDULING_FAILED', nudgeStep),
    ).catch(() => undefined);
    return false;
  }
}

function configureNotificationHandler(notifications: NotificationsModule) {
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function ensureAndroidChannel(notifications: NotificationsModule) {
  if (Platform.OS !== 'android') return;
  await notifications.setNotificationChannelAsync('reminders', {
    name: 'Reminders',
    description: 'Alerts for reminders you create in Smart Reminder.',
    importance: notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
  });
}

async function ensureReminderNotificationCategory(notifications: NotificationsModule) {
  await notifications.setNotificationCategoryAsync(
    REMINDER_NOTIFICATION_CATEGORY,
    [
      {
        identifier: COMPLETE_NOTIFICATION_ACTION,
        buttonTitle: 'Complete',
        options: {
          opensAppToForeground: true,
          isAuthenticationRequired: false,
          isDestructive: false,
        },
      },
      {
        identifier: SNOOZE_NOTIFICATION_ACTION,
        buttonTitle: 'Snooze 10 min',
        options: {
          opensAppToForeground: true,
          isAuthenticationRequired: false,
          isDestructive: false,
        },
      },
    ],
  );
}

function notificationIdentifiers(occurrence: Occurrence) {
  const base = `occurrence:${occurrence.id}:r${occurrence.scheduleRevision}`;
  return { base, nudge: `${base}:n1` };
}

async function cancelIdentifiers(
  notifications: NotificationsModule,
  identifiers: ReturnType<typeof notificationIdentifiers>,
) {
  await Promise.all([
    notifications.cancelScheduledNotificationAsync(identifiers.base).catch(() => undefined),
    notifications.cancelScheduledNotificationAsync(identifiers.nudge).catch(() => undefined),
  ]);
}

function notificationTitle(
  reminder: ReminderDetail,
  privacy: 'FULL' | 'TITLE_ONLY' | 'PRIVATE' | undefined,
) {
  return privacy === 'PRIVATE' ? 'Smart Reminder' : reminder.title;
}

function notificationBody(
  reminder: ReminderDetail,
  privacy: 'FULL' | 'TITLE_ONLY' | 'PRIVATE' | undefined,
) {
  if (privacy === 'PRIVATE') return 'You have a reminder.';
  if (privacy === 'TITLE_ONLY') return 'Your reminder is due now.';
  return reminder.contextNote ?? 'Your reminder is due now.';
}

function applyQuietHours(
  date: Date,
  preferences:
    | {
        quietHoursStart: string | null;
        quietHoursEnd: string | null;
        timezone: string;
      }
    | null,
): Date {
  if (!preferences?.quietHoursStart || !preferences.quietHoursEnd) return date;
  const start = clockMinutes(preferences.quietHoursStart);
  const end = clockMinutes(preferences.quietHoursEnd);
  const currentMinute = localMinute(date, preferences.timezone);
  if (!insideQuietHours(currentMinute, start, end)) return date;
  let delayMinutes = end - currentMinute;
  if (delayMinutes <= 0) delayMinutes += 24 * 60;
  let candidate = new Date(date.getTime() + delayMinutes * 60_000);
  for (let index = 0; index < 9; index += 1) {
    const minute = localMinute(candidate, preferences.timezone);
    if (!insideQuietHours(minute, start, end)) return candidate;
    candidate = new Date(candidate.getTime() + 15 * 60_000);
  }
  return candidate;
}

function clockMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour! * 60 + minute!;
}

function localMinute(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: timezone,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function insideQuietHours(minute: number, start: number, end: number) {
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}
