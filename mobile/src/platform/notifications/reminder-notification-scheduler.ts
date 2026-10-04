import { Platform } from 'react-native';

import { queryClient } from '../../api/query-client';
import { getInstallationId } from '../../device/device-installation';
import {
  notificationAttemptKey,
  reportNotificationAttempt,
} from '../../device/notification-attempt.api';
import {
  getNotificationPreferences,
  notificationPreferencesQueryKey,
  type NotificationPreferences,
} from '../../preferences/preferences.api';
import {
  getNudgePolicy,
  getReminder,
  listReminderOccurrences,
} from '../../reminders/reminder.api';
import { reminderCachePolicy, reminderQueryKeys } from '../../reminders/reminder.queries';
import type { NudgePolicy, ReminderDetail } from '../../reminders/reminder.schemas';
import { loadNotificationsModule } from './notification-runtime';
import {
  getNotificationAlertPreferences,
  notificationAlertPreferencesQueryKey,
  notificationChannelId,
  notificationVibrationPattern,
  type NotificationAlertPreferences,
} from './notification-alert-preferences';

type NotificationsModule = NonNullable<Awaited<ReturnType<typeof loadNotificationsModule>>>;
type Occurrence = ReminderDetail['occurrences'][number];
type ReminderSchedulingOptions = {
  notificationPreferences?: NotificationPreferences | null;
  nudgePolicy?: NudgePolicy | null;
  alertPreferences?: NotificationAlertPreferences;
};

const NATIVE_SCHEDULING_CONCURRENCY = 4;
const REMINDER_RECONCILIATION_CONCURRENCY = 2;
const RECONCILIATION_COOLDOWN_MS = 5 * 60_000;

const schedulingTasks = new Map<string, Promise<ReminderSchedulingResult>>();
let notificationSetupKey: string | null = null;
let notificationSetupTask: Promise<void> | null = null;
let reconciliationTask: Promise<ReconciliationResult> | null = null;
let lastReconciliationAt = 0;
let lastReconciliationResult: ReconciliationResult = { reminders: 0, scheduled: 0 };

type ReconciliationResult = {
  reminders: number;
  scheduled: number;
};

export const REMINDER_NOTIFICATION_CATEGORY = 'reminder_actions';
export const COMPLETE_NOTIFICATION_ACTION = 'complete_reminder';
export const SNOOZE_NOTIFICATION_ACTION = 'snooze_reminder_10';

export type ReminderSchedulingResult =
  | { status: 'scheduled'; count: number }
  | { status: 'paused'; count: 0 }
  | { status: 'unavailable'; count: 0 }
  | { status: 'failed'; count: number };

export type ImmediateAlarmResult = 'presented' | 'unavailable' | 'failed';

export async function presentReminderAlarmNow(
  input: { title: string; body: string },
  alertPreferences?: NotificationAlertPreferences,
): Promise<ImmediateAlarmResult> {
  const notifications = await loadNotificationsModule();
  if (!notifications) return 'unavailable';

  try {
    const preferences =
      alertPreferences ?? (await getCachedNotificationAlertPreferences());
    await ensureNotificationSetup(notifications, preferences);
    await notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        sound: preferences.sound === 'SILENT' ? false : 'default',
        ...(Platform.OS === 'android'
          ? { priority: notifications.AndroidNotificationPriority.MAX }
          : {}),
        ...(Platform.OS === 'ios' && preferences.alertStyle === 'ALARM'
          ? { interruptionLevel: 'timeSensitive' as const }
          : {}),
        data: { alertStyle: 'ALARM_FALLBACK' },
      },
      trigger:
        Platform.OS === 'android'
          ? { channelId: notificationChannelId(preferences) }
          : null,
    });
    return 'presented';
  } catch {
    return 'failed';
  }
}

export function scheduleReminderNotifications(
  reminder: ReminderDetail,
  options: ReminderSchedulingOptions = {},
): Promise<ReminderSchedulingResult> {
  const taskKey = `${reminder.id}:${reminder.schedule.revision}:${reminder.updatedAt}`;
  const existing = schedulingTasks.get(taskKey);
  if (existing) return existing;

  const task = scheduleReminderNotificationsInternal(reminder, options);
  schedulingTasks.set(taskKey, task);
  void task
    .finally(() => {
      if (schedulingTasks.get(taskKey) === task) schedulingTasks.delete(taskKey);
    })
    .catch(() => undefined);
  return task;
}

async function scheduleReminderNotificationsInternal(
  reminder: ReminderDetail,
  options: ReminderSchedulingOptions,
): Promise<ReminderSchedulingResult> {
  const notifications = await loadNotificationsModule();
  if (!notifications) return { status: 'unavailable', count: 0 };

  try {
    const installationId = await getInstallationId();
    const [preferences, nudgePolicy, alertPreferences] = await Promise.all([
      options.notificationPreferences !== undefined
        ? options.notificationPreferences
        : getCachedNotificationPreferences().catch(() => null),
      options.nudgePolicy !== undefined
        ? options.nudgePolicy
        : getCachedNudgePolicy(reminder.id).catch(() => null),
      options.alertPreferences ?? getCachedNotificationAlertPreferences(),
    ]);
    await ensureNotificationSetup(notifications, alertPreferences);

    if (preferences?.globallyPaused) {
      await cancelReminderNotifications(reminder);
      return { status: 'paused', count: 0 };
    }

    const results = await mapWithConcurrency(
      reminder.occurrences,
      NATIVE_SCHEDULING_CONCURRENCY,
      async (occurrence) => {
        const identifiers = notificationIdentifiers(occurrence);
        if (
          occurrence.lifecycle !== 'SCHEDULED' ||
          new Date(occurrence.effectiveScheduledAt).getTime() <= Date.now()
        ) {
          await cancelIdentifiers(notifications, identifiers);
          return { scheduled: 0, failed: 0 };
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
          alertPreferences,
        });
        let scheduled = baseResult ? 1 : 0;
        let failed = baseResult ? 0 : 1;

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
            alertPreferences,
          });
          scheduled += nudgeResult ? 1 : 0;
          failed += nudgeResult ? 0 : 1;
        }
        return { scheduled, failed };
      },
    );
    const scheduled = results.reduce((total, result) => total + result.scheduled, 0);
    const failed = results.reduce((total, result) => total + result.failed, 0);

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
  await mapWithConcurrency(
    reminder.occurrences,
    NATIVE_SCHEDULING_CONCURRENCY,
    async (occurrence) => {
      const identifiers = notificationIdentifiers(occurrence);
      await Promise.all(
        ([0, 1] as const).map(async (nudgeStep) => {
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
        }),
      );
    },
  );
}

export function reconcileReminderNotifications(
  options: { force?: boolean } = {},
): Promise<ReconciliationResult> {
  if (reconciliationTask) return reconciliationTask;
  if (!options.force && Date.now() - lastReconciliationAt < RECONCILIATION_COOLDOWN_MS) {
    return Promise.resolve(lastReconciliationResult);
  }

  const task = reconcileReminderNotificationsInternal();
  reconciliationTask = task;
  void task
    .then((result) => {
      lastReconciliationAt = Date.now();
      lastReconciliationResult = result;
    })
    .catch(() => undefined)
    .finally(() => {
      if (reconciliationTask === task) reconciliationTask = null;
    });
  return task;
}

async function reconcileReminderNotificationsInternal(): Promise<ReconciliationResult> {
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
  const [notificationPreferences, alertPreferences] = await Promise.all([
    getCachedNotificationPreferences().catch(() => null),
    getCachedNotificationAlertPreferences(),
  ]);
  const results = await mapWithConcurrency(
    [...reminderIds],
    REMINDER_RECONCILIATION_CONCURRENCY,
    async (reminderId) => {
      const reminder = await getReminder(reminderId);
      return scheduleReminderNotifications(reminder, {
        notificationPreferences,
        alertPreferences,
      });
    },
  );
  const scheduled = results.reduce((total, result) => total + result.count, 0);
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
  alertPreferences,
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
  alertPreferences: NotificationAlertPreferences;
}): Promise<boolean> {
  try {
    await notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title,
        body,
        sound: alertPreferences.sound === 'SILENT' ? false : 'default',
        categoryIdentifier: REMINDER_NOTIFICATION_CATEGORY,
        ...(Platform.OS === 'android' && alertPreferences.alertStyle === 'ALARM'
          ? { priority: notifications.AndroidNotificationPriority.MAX }
          : {}),
        ...(Platform.OS === 'ios' && alertPreferences.alertStyle === 'ALARM'
          ? { interruptionLevel: 'timeSensitive' as const }
          : {}),
        data: {
          url:
            alertPreferences.alertStyle === 'ALARM'
              ? `/alarm/${occurrence.id}?reminderId=${reminder.id}`
              : `/reminders/${reminder.id}?occurrenceId=${occurrence.id}`,
          detailUrl: `/reminders/${reminder.id}?occurrenceId=${occurrence.id}`,
          reminderId: reminder.id,
          occurrenceId: occurrence.id,
          scheduleRevision: occurrence.scheduleRevision,
          effectiveScheduledAt: occurrence.effectiveScheduledAt,
          nudgeStep,
          alertStyle: alertPreferences.alertStyle,
        },
      },
      trigger: {
        type: notifications.SchedulableTriggerInputTypes.DATE,
        date,
        ...(Platform.OS === 'android'
          ? { channelId: notificationChannelId(alertPreferences) }
          : {}),
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

function getCachedNotificationPreferences(): Promise<NotificationPreferences> {
  return queryClient.fetchQuery({
    queryKey: notificationPreferencesQueryKey,
    queryFn: getNotificationPreferences,
    staleTime: reminderCachePolicy.staleTime,
  });
}

function getCachedNudgePolicy(reminderId: string): Promise<NudgePolicy> {
  return queryClient.fetchQuery({
    queryKey: reminderQueryKeys.nudgePolicy(reminderId),
    queryFn: () => getNudgePolicy(reminderId),
    staleTime: reminderCachePolicy.staleTime,
  });
}

function getCachedNotificationAlertPreferences(): Promise<NotificationAlertPreferences> {
  return queryClient.fetchQuery({
    queryKey: notificationAlertPreferencesQueryKey,
    queryFn: getNotificationAlertPreferences,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

async function ensureNotificationSetup(
  notifications: NotificationsModule,
  preferences: NotificationAlertPreferences,
): Promise<void> {
  configureNotificationHandler(notifications, preferences);
  const setupKey = [
    Platform.OS,
    preferences.sound,
    preferences.vibration,
    preferences.alertStyle,
  ].join(':');
  if (notificationSetupKey === setupKey && notificationSetupTask) {
    return notificationSetupTask;
  }

  notificationSetupKey = setupKey;
  const task = Promise.all([
    ensureAndroidChannel(notifications, preferences),
    ensureReminderNotificationCategory(notifications),
  ]).then(() => undefined);
  notificationSetupTask = task;
  try {
    await task;
  } catch (error) {
    if (notificationSetupTask === task) {
      notificationSetupKey = null;
      notificationSetupTask = null;
    }
    throw error;
  }
}

async function mapWithConcurrency<Input, Output>(
  items: readonly Input[],
  concurrency: number,
  operation: (item: Input) => Promise<Output>,
): Promise<Output[]> {
  const results = new Array<Output>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await operation(items[index]!);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function configureNotificationHandler(
  notifications: NotificationsModule,
  preferences: NotificationAlertPreferences,
) {
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: preferences.sound !== 'SILENT',
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function ensureAndroidChannel(
  notifications: NotificationsModule,
  preferences: NotificationAlertPreferences,
) {
  if (Platform.OS !== 'android') return;
  const pattern = notificationVibrationPattern(preferences.vibration);
  await notifications.setNotificationChannelAsync(notificationChannelId(preferences), {
    name: [
      'Reminders',
      preferences.alertStyle === 'ALARM' ? 'Alarm' : 'Notification',
      soundLabel(preferences),
      vibrationLabel(preferences),
    ].join(' · '),
    description: 'Alerts for reminders you create in Smart Reminder.',
    audioAttributes: {
      usage:
        preferences.alertStyle === 'ALARM'
          ? notifications.AndroidAudioUsage.ALARM
          : notifications.AndroidAudioUsage.NOTIFICATION,
      contentType: notifications.AndroidAudioContentType.SONIFICATION,
    },
    enableVibrate: preferences.vibration !== 'OFF',
    importance: notifications.AndroidImportance.MAX,
    sound: preferences.sound === 'SILENT' ? null : 'default',
    ...(pattern ? { vibrationPattern: pattern } : {}),
  });
}

export async function prepareSelectedNotificationChannel(): Promise<string | null> {
  const notifications = await loadNotificationsModule();
  if (!notifications) return null;
  const preferences = await getNotificationAlertPreferences();
  configureNotificationHandler(notifications, preferences);
  await ensureAndroidChannel(notifications, preferences);
  return Platform.OS === 'android' ? notificationChannelId(preferences) : null;
}

function soundLabel(preferences: NotificationAlertPreferences) {
  return preferences.sound === 'SILENT' ? 'Silent' : 'Sound';
}

function vibrationLabel(preferences: NotificationAlertPreferences) {
  switch (preferences.vibration) {
    case 'OFF':
      return 'No vibration';
    case 'SHORT':
      return 'Short vibration';
    case 'STRONG':
      return 'Strong vibration';
    case 'STANDARD':
    default:
      return 'Standard vibration';
  }
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
