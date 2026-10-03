import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, Pressable, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthProvider';
import { formErrorMessage } from '../../auth/form-error';
import { SymbolIcon } from '../../components/ui/SymbolIcon';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/ToastProvider';
import { cn } from '../../lib/cn';
import { useOnboarding } from '../../onboarding/onboarding-context';
import {
  getNotificationAlertPreferences,
  notificationVibrationPattern,
} from '../../platform/notifications/notification-alert-preferences';
import { scheduleReminderNotifications } from '../../platform/notifications/reminder-notification-scheduler';
import {
  completeOccurrence,
  createIdempotencyKey,
  getReminder,
  snoozeOccurrence,
} from '../../reminders/reminder.api';
import { reminderCachePolicy, reminderQueryKeys } from '../../reminders/reminder.queries';

type AlarmAction = 'complete' | 'snooze';

export default function AlarmScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ occurrenceId: string; reminderId?: string }>();
  const { status } = useAuth();
  const { state } = useOnboarding();
  const { showToast } = useToast();

  const reminder = useQuery({
    queryKey: reminderQueryKeys.detail(params.reminderId ?? 'unavailable'),
    queryFn: () => getReminder(params.reminderId!),
    enabled: status === 'authenticated' && Boolean(params.reminderId),
    ...reminderCachePolicy,
  });
  const occurrence = useMemo(
    () => reminder.data?.occurrences.find((item) => item.id === params.occurrenceId),
    [params.occurrenceId, reminder.data?.occurrences],
  );

  useEffect(() => {
    let active = true;
    void getNotificationAlertPreferences().then((preferences) => {
      if (!active || preferences.vibration === 'OFF') return;
      if (Platform.OS === 'android') {
        const pattern = notificationVibrationPattern(preferences.vibration);
        if (pattern) Vibration.vibrate([...pattern, 1_200], true);
      } else {
        Vibration.vibrate();
      }
    });
    return () => {
      active = false;
      Vibration.cancel();
    };
  }, []);

  const action = useMutation({
    mutationFn: async (value: AlarmAction) => {
      if (!reminder.data || !occurrence) throw new Error('This reminder occurrence is unavailable.');
      Vibration.cancel();
      const expected = {
        occurrenceId: occurrence.id,
        expectedScheduleRevision: occurrence.scheduleRevision,
        expectedEffectiveScheduledAt: occurrence.effectiveScheduledAt,
      };
      if (value === 'complete') {
        await completeOccurrence({
          ...expected,
          idempotencyKey: createIdempotencyKey('alarm-complete'),
        });
      } else {
        await snoozeOccurrence({
          ...expected,
          until: new Date(Date.now() + 10 * 60_000).toISOString(),
          idempotencyKey: createIdempotencyKey('alarm-snooze'),
        });
      }
      return value;
    },
    onSuccess: async (value) => {
      const refreshed = await getReminder(params.reminderId!);
      queryClient.setQueryData(reminderQueryKeys.detail(params.reminderId!), refreshed);
      await scheduleReminderNotifications(refreshed);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: reminderQueryKeys.occurrenceLists() }),
        queryClient.invalidateQueries({ queryKey: reminderQueryKeys.events(params.reminderId!) }),
      ]);
      showToast({
        title: value === 'complete' ? 'Reminder completed' : 'Snoozed for 10 minutes',
        message:
          value === 'complete'
            ? 'This occurrence is now in Completed.'
            : 'The alert is scheduled again in 10 minutes.',
        tone: 'success',
      });
      router.replace('/home');
    },
    onError: (error) =>
      showToast({
        title: 'Couldn’t update the reminder',
        message: formErrorMessage(error),
        tone: 'error',
      }),
  });

  if (status === 'unauthenticated') return <Redirect href="/" />;

  const locale = state.preferences.locale;
  const timeFormat = state.preferences.timeFormat;
  const timezone = reminder.data?.schedule.timezone ?? state.preferences.timezone;
  const scheduledAt = occurrence ? new Date(occurrence.effectiveScheduledAt) : null;
  const detailRoute = params.reminderId
    ? `/reminders/${params.reminderId}?occurrenceId=${params.occurrenceId}`
    : '/home';

  return (
    <SafeAreaView className="flex-1 bg-ink" edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View className="flex-1 px-6 pb-6 pt-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="size-9 items-center justify-center rounded-full bg-white/10">
              <SymbolIcon className="text-kast-lime" name="notification" size={17} />
            </View>
            <Text className="ml-3 font-inter-semibold text-[13px] uppercase tracking-[1.4px] text-white/70">
              Reminder due
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close alarm screen"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
            onPress={() => {
              Vibration.cancel();
              router.replace(detailRoute);
            }}
          >
            <SymbolIcon className="text-white" name="delete" size={24} />
          </Pressable>
        </View>

        {reminder.isPending || status === 'bootstrapping' ? (
          <View
            accessibilityLabel="Loading reminder alarm"
            accessibilityRole="progressbar"
            className="flex-1 items-center justify-center px-5"
          >
            <Skeleton className="h-20 w-48 bg-white/10" />
            <Skeleton className="mt-8 h-8 w-4/5 max-w-[420px] bg-white/10" />
            <Skeleton className="mt-3 h-4 w-3/5 max-w-[320px] bg-white/10" />
            <Skeleton className="mt-12 h-16 w-full max-w-[560px] rounded-[20px] bg-white/10" />
            <Skeleton className="mt-3 h-16 w-full max-w-[560px] rounded-[20px] bg-white/10" />
          </View>
        ) : reminder.isError || !reminder.data || !occurrence || !scheduledAt ? (
          <View className="flex-1 items-center justify-center px-4">
            <Text className="text-center font-display-semibold text-[28px] text-white">
              Reminder unavailable
            </Text>
            <Text className="mt-3 text-center font-inter text-[14px] leading-6 text-white/60">
              {reminder.isError
                ? formErrorMessage(reminder.error)
                : 'This occurrence may have already changed on another device.'}
            </Text>
            <Pressable
              className="mt-7 min-h-12 items-center justify-center rounded-full bg-white px-6"
              onPress={() => router.replace('/home')}
            >
              <Text className="font-inter-semibold text-[14px] text-ink">Back to reminders</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View className="flex-1 items-center justify-center pb-4">
              <Text className="font-display-semibold text-[76px] leading-[84px] tracking-[-4px] text-white">
                {formatTime(scheduledAt, locale, timezone, timeFormat)}
              </Text>
              <Text className="mt-1 font-inter-medium text-[15px] text-white/55">
                {formatDate(scheduledAt, locale, timezone)} · {timezone}
              </Text>
              <View className="mt-10 h-px w-12 bg-kast-lime" />
              <Text className="mt-8 max-w-[560px] text-center font-display-semibold text-[30px] leading-[36px] text-white">
                {reminder.data.title}
              </Text>
              {reminder.data.contextNote ? (
                <Text className="mt-3 max-w-[520px] text-center font-inter text-[15px] leading-6 text-white/60">
                  {reminder.data.contextNote}
                </Text>
              ) : null}
            </View>

            <View className="w-full max-w-[560px] self-center">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: action.isPending }}
                className={cn(
                  'min-h-16 flex-row items-center justify-center rounded-[20px] bg-kast-lime px-5',
                  action.isPending && 'opacity-50',
                )}
                disabled={action.isPending}
                onPress={() => action.mutate('complete')}
              >
                <SymbolIcon className="text-ink" name="check" size={21} />
                <Text className="ml-2 font-inter-bold text-[16px] text-ink">Complete</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: action.isPending }}
                className={cn(
                  'mt-3 min-h-16 flex-row items-center justify-center rounded-[20px] bg-white/10 px-5',
                  action.isPending && 'opacity-50',
                )}
                disabled={action.isPending}
                onPress={() => action.mutate('snooze')}
              >
                <SymbolIcon className="text-white" name="clock" size={21} />
                <Text className="ml-2 font-inter-semibold text-[16px] text-white">
                  Snooze 10 minutes
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                className="min-h-12 items-center justify-center"
                disabled={action.isPending}
                onPress={() => {
                  Vibration.cancel();
                  router.replace(detailRoute);
                }}
              >
                <Text className="font-inter-semibold text-[13px] text-white/60">View reminder details</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function formatTime(
  date: Date,
  locale: string,
  timezone: string,
  format: '12-hour' | '24-hour',
) {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: format === '12-hour',
    timeZone: timezone,
  }).format(date);
}

function formatDate(date: Date, locale: string, timezone: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  }).format(date);
}
