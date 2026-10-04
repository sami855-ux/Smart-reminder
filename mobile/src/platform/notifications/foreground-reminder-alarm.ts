import { useEffect } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { AppState } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { getNotificationPreferences } from '../../preferences/preferences.api';
import { listReminderOccurrences } from '../../reminders/reminder.api';
import { getNotificationAlertPreferences } from './notification-alert-preferences';
import { presentReminderAlarmNow } from './reminder-notification-scheduler';

const RECENT_DUE_WINDOW_MS = 2 * 60_000;
const MAX_REFRESH_MS = 60_000;
const RETRY_MS = 15_000;
const openedOccurrences = new Set<string>();

export function useForegroundReminderAlarm(): void {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useAuth();

  useEffect(() => {
    if (status !== 'authenticated') return;

    let active = true;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    function scheduleNextCheck(delay: number) {
      if (!active) return;
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => void checkForDueReminder(), delay);
    }

    async function checkForDueReminder() {
      if (!active) return;
      if (AppState.currentState !== 'active') {
        scheduleNextCheck(MAX_REFRESH_MS);
        return;
      }

      const now = Date.now();
      try {
        const [alertPreferences, accountPreferences, occurrences] = await Promise.all([
          getNotificationAlertPreferences(),
          getNotificationPreferences().catch(() => null),
          listReminderOccurrences({
            view: 'ALL',
            from: new Date(now - RECENT_DUE_WINDOW_MS).toISOString(),
            to: new Date(now + 24 * 60 * 60_000).toISOString(),
            limit: 50,
          }),
        ]);

        if (
          alertPreferences.alertStyle === 'ALARM' &&
          !accountPreferences?.globallyPaused &&
          !insideQuietHours(new Date(now), accountPreferences)
        ) {
          const scheduled = occurrences.items
            .filter((item) => item.lifecycle === 'SCHEDULED')
            .sort(
              (left, right) =>
                new Date(left.effectiveScheduledAt).getTime() -
                new Date(right.effectiveScheduledAt).getTime(),
            );
          const due = [...scheduled]
            .reverse()
            .find((item) => {
              const dueAt = new Date(item.effectiveScheduledAt).getTime();
              return dueAt <= now && now - dueAt <= RECENT_DUE_WINDOW_MS;
            });

          if (due) {
            const occurrenceKey = `${due.id}:${due.scheduleRevision}:${due.effectiveScheduledAt}`;
            if (!openedOccurrences.has(occurrenceKey) && !pathname.startsWith('/alarm/')) {
              openedOccurrences.add(occurrenceKey);
              const privacy = accountPreferences?.lockScreenPrivacy;
              await presentReminderAlarmNow(
                {
                  title: privacy === 'PRIVATE' ? 'Smart Reminder' : due.title,
                  body:
                    privacy === 'PRIVATE'
                      ? 'You have a reminder.'
                      : privacy === 'TITLE_ONLY'
                        ? 'Your reminder is due now.'
                        : due.contextNote ?? 'Your reminder is due now.',
                },
                alertPreferences,
              );
              if (active) {
                router.push({
                  pathname: '/alarm/[occurrenceId]',
                  params: { occurrenceId: due.id, reminderId: due.reminderId },
                });
              }
            }
          }

          const next = scheduled.find(
            (item) => new Date(item.effectiveScheduledAt).getTime() > now,
          );
          if (next) {
            // Give the native notification listener a brief head start. If the
            // OS delivery path does not fire, this foreground fallback opens
            // the alarm screen immediately afterwards.
            const delay = new Date(next.effectiveScheduledAt).getTime() - now + 1_500;
            scheduleNextCheck(Math.min(MAX_REFRESH_MS, Math.max(1_000, delay)));
            return;
          }
        }

        scheduleNextCheck(MAX_REFRESH_MS);
      } catch {
        scheduleNextCheck(RETRY_MS);
      }
    }

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void checkForDueReminder();
    });
    void checkForDueReminder();

    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
      appStateSubscription.remove();
    };
  }, [pathname, router, status]);
}

function insideQuietHours(
  date: Date,
  preferences:
    | {
        quietHoursStart: string | null;
        quietHoursEnd: string | null;
        timezone: string;
      }
    | null,
) {
  if (!preferences?.quietHoursStart || !preferences.quietHoursEnd) return false;
  const start = clockMinutes(preferences.quietHoursStart);
  const end = clockMinutes(preferences.quietHoursEnd);
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: preferences.timezone,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  const current = hour * 60 + minute;
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

function clockMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour! * 60 + minute!;
}
