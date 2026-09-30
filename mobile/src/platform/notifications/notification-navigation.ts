import { useEffect } from 'react';
import { type Href, useRouter } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';

import { queryClient } from '../../api/query-client';
import { useAuth } from '../../auth/AuthProvider';
import { formErrorMessage } from '../../auth/form-error';
import { useToast } from '../../components/ui/ToastProvider';
import { getInstallationId } from '../../device/device-installation';
import {
  notificationAttemptKey,
  reportNotificationAttempt,
} from '../../device/notification-attempt.api';
import {
  completeOccurrence,
  getReminder,
  snoozeOccurrence,
} from '../../reminders/reminder.api';
import { loadNotificationsModule } from './notification-runtime';
import {
  COMPLETE_NOTIFICATION_ACTION,
  scheduleReminderNotifications,
  SNOOZE_NOTIFICATION_ACTION,
} from './reminder-notification-scheduler';

const handledResponses = new Set<string>();

export function useNotificationNavigation(): void {
  const router = useRouter();
  const { status } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (status !== 'authenticated') return;

    let active = true;
    let removeListener: (() => void) | null = null;

    async function handleResponse(response: NotificationResponse) {
      const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (handledResponses.has(responseKey)) return;
      handledResponses.add(responseKey);

      const data = response.notification.request.content.data;
      const route = reminderRoute(data);
      const payload = notificationPayload(data);
      if (!payload) {
        if (active && route) router.push(route);
        return;
      }

      const notifications = await loadNotificationsModule();
      const isDefaultAction =
        notifications && response.actionIdentifier === notifications.DEFAULT_ACTION_IDENTIFIER;

      if (isDefaultAction) {
        if (active && route) router.push(route);
        void reportOutcome(payload, 'OPENED');
        return;
      }

      try {
        if (response.actionIdentifier === COMPLETE_NOTIFICATION_ACTION) {
          await completeOccurrence({
            occurrenceId: payload.occurrenceId,
            expectedScheduleRevision: payload.scheduleRevision,
            expectedEffectiveScheduledAt: payload.effectiveScheduledAt,
            idempotencyKey: notificationActionKey('complete', payload),
          });
        } else if (response.actionIdentifier === SNOOZE_NOTIFICATION_ACTION) {
          await snoozeOccurrence({
            occurrenceId: payload.occurrenceId,
            expectedScheduleRevision: payload.scheduleRevision,
            expectedEffectiveScheduledAt: payload.effectiveScheduledAt,
            until: new Date(Date.now() + 10 * 60_000).toISOString(),
            idempotencyKey: notificationActionKey('snooze', payload),
          });
        } else {
          if (active && route) router.push(route);
          return;
        }

        await reportOutcome(payload, 'ACTED_ON');
        const reminder = await getReminder(payload.reminderId);
        await scheduleReminderNotifications(reminder);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['reminder-occurrences'] }),
          queryClient.invalidateQueries({ queryKey: ['reminder', payload.reminderId] }),
          queryClient.invalidateQueries({ queryKey: ['reminder-events', payload.reminderId] }),
        ]);
        if (!active) return;
        showToast({
          title:
            response.actionIdentifier === COMPLETE_NOTIFICATION_ACTION
              ? 'Reminder completed'
              : 'Reminder snoozed',
          message:
            response.actionIdentifier === COMPLETE_NOTIFICATION_ACTION
              ? 'The reminder was completed from the notification.'
              : 'The reminder will alert you again in 10 minutes.',
          tone: 'success',
        });
      } catch (error) {
        if (!active) return;
        if (route) router.push(route);
        showToast({
          title: 'Couldn’t update the reminder',
          message: formErrorMessage(error),
          tone: 'error',
        });
      }
    }

    void loadNotificationsModule().then(async (notifications) => {
      if (!active || !notifications) return;
      const initial = await notifications.getLastNotificationResponseAsync();
      if (initial) await handleResponse(initial);
      if (!active) return;
      const subscription = notifications.addNotificationResponseReceivedListener(
        (response) => void handleResponse(response),
      );
      removeListener = () => subscription.remove();
    });

    return () => {
      active = false;
      removeListener?.();
    };
  }, [router, showToast, status]);
}

type NotificationPayload = {
  reminderId: string;
  occurrenceId: string;
  scheduleRevision: number;
  effectiveScheduledAt: string;
  nudgeStep: 0 | 1;
};

function notificationPayload(
  data: Record<string, unknown> | undefined,
): NotificationPayload | null {
  if (!data) return null;
  const reminderId = data['reminderId'];
  const occurrenceId = data['occurrenceId'];
  const scheduleRevision = data['scheduleRevision'];
  const effectiveScheduledAt = data['effectiveScheduledAt'];
  const nudgeStep = data['nudgeStep'];
  if (
    typeof reminderId !== 'string' ||
    typeof occurrenceId !== 'string' ||
    typeof scheduleRevision !== 'number' ||
    typeof effectiveScheduledAt !== 'string'
  ) {
    return null;
  }
  return {
    reminderId,
    occurrenceId,
    scheduleRevision,
    effectiveScheduledAt,
    nudgeStep: nudgeStep === 1 ? 1 : 0,
  };
}

function reminderRoute(data: Record<string, unknown> | undefined): Href | null {
  if (!data) return null;
  const value = data['url'];
  return typeof value === 'string' && value.startsWith('/reminders/')
    ? (value as Href)
    : null;
}

function notificationActionKey(
  action: 'complete' | 'snooze',
  payload: NotificationPayload,
) {
  return `notification:${action}:${payload.occurrenceId}:r${payload.scheduleRevision}:n${payload.nudgeStep}`;
}

async function reportOutcome(
  payload: NotificationPayload,
  outcome: 'OPENED' | 'ACTED_ON',
) {
  const deviceInstallationId = await getInstallationId();
  await reportNotificationAttempt(
    {
      occurrenceId: payload.occurrenceId,
      deviceInstallationId,
      scheduleRevision: payload.scheduleRevision,
      effectiveScheduledAt: payload.effectiveScheduledAt,
      nudgeStep: payload.nudgeStep,
      outcome,
    },
    notificationAttemptKey(payload.occurrenceId, outcome, payload.nudgeStep),
  ).catch(() => undefined);
}
