import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { formErrorMessage } from '../auth/form-error';
import { PermissionWarning } from '../components/ui/PermissionWarning';
import { useOnboarding } from '../onboarding/onboarding-context';
import {
  notificationPermissionAllowsAlerts,
  openNotificationSettings,
} from '../platform/notifications/notification-permission';
import { listReminderOccurrences } from '../reminders/reminder.api';
import type { OccurrenceListItem } from '../reminders/reminder.schemas';

export default function HomeScreen() {
  const router = useRouter();
  const { status, user } = useAuth();
  const { state } = useOnboarding();
  const range = useMemo(() => occurrenceRange(), []);
  const occurrences = useQuery({
    queryKey: ['reminder-occurrences', range.from, range.to],
    queryFn: () => listReminderOccurrences({ ...range, limit: 50 }),
    enabled: status === 'authenticated',
  });
  const permissionAllowed = notificationPermissionAllowsAlerts(
    state.notificationPermission,
  );

  if (status !== 'authenticated' || !user) return <Redirect href="/" />;

  const groups = groupOccurrences(occurrences.data?.items ?? []);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-14"
        refreshControl={
          <RefreshControl
            refreshing={occurrences.isRefetching}
            tintColor="#262626"
            onRefresh={() => void occurrences.refetch()}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full max-w-[720px] self-center px-5">
          <View className="flex-row items-center justify-between pb-5 pt-2">
            <View>
              <Text className="text-[13px] font-semibold tracking-[1.4px] text-subtle-ink">
                {formatToday(state.preferences.locale).toUpperCase()}
              </Text>
              <Text
                accessibilityRole="header"
                className="mt-1 text-[38px] font-bold leading-[44px] tracking-[-1.1px] text-ink"
              >
                Your day
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Account and settings"
              accessibilityRole="button"
              className="size-12 items-center justify-center rounded-full border border-taupe bg-paper active:bg-secondary-fill"
              onPress={() => router.push('/account')}
            >
              <Text className="text-[16px] font-bold uppercase text-ink">
                {user.email.slice(0, 1)}
              </Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityHint="Opens the reminder creation form"
            accessibilityRole="button"
            className="mb-5 min-h-[92px] flex-row items-center rounded-[24px] bg-ink px-5 py-4 active:opacity-85"
            onPress={() => router.push('/create-reminder')}
          >
            <View className="size-12 items-center justify-center rounded-full bg-white/15">
              <Text className="text-[28px] font-light text-white">+</Text>
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-[18px] font-semibold text-white">Create a reminder</Text>
              <Text className="mt-1 text-[13px] leading-5 text-white/65">
                Type naturally or choose an exact schedule
              </Text>
            </View>
            <Text className="text-[26px] font-light text-white/60">›</Text>
          </Pressable>

          {!permissionAllowed ? (
            <View className="mb-5">
              <PermissionWarning
                onOpenSettings={() => void openNotificationSettings()}
                state={state.notificationPermission}
              />
            </View>
          ) : null}

          {occurrences.isPending ? (
            <View className="items-center rounded-[22px] border border-taupe bg-paper py-12">
              <ActivityIndicator color="#262626" />
              <Text className="mt-3 text-[14px] text-muted-ink">Loading your reminders…</Text>
            </View>
          ) : occurrences.isError ? (
            <View className="rounded-[22px] border border-taupe bg-paper p-5">
              <Text className="text-[18px] font-semibold text-ink">Your reminders didn’t load</Text>
              <Text className="mt-2 text-[14px] leading-5 text-muted-ink">
                {formErrorMessage(occurrences.error)}
              </Text>
              <Pressable
                accessibilityRole="button"
                className="mt-4 min-h-11 items-center justify-center rounded-xl bg-secondary-fill"
                onPress={() => void occurrences.refetch()}
              >
                <Text className="text-[15px] font-semibold text-ink">Try again</Text>
              </Pressable>
            </View>
          ) : groups.total === 0 ? (
            <EmptyState onCreate={() => router.push('/create-reminder')} />
          ) : (
            <View className="gap-6">
              <OccurrenceSection
                items={groups.overdue}
                label="OVERDUE"
                locale={state.preferences.locale}
                onOpen={(item) => openOccurrence(router, item)}
                timeFormat={state.preferences.timeFormat}
              />
              <OccurrenceSection
                items={groups.today}
                label="TODAY"
                locale={state.preferences.locale}
                onOpen={(item) => openOccurrence(router, item)}
                timeFormat={state.preferences.timeFormat}
              />
              <OccurrenceSection
                items={groups.upcoming}
                label="UPCOMING"
                locale={state.preferences.locale}
                onOpen={(item) => openOccurrence(router, item)}
                timeFormat={state.preferences.timeFormat}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function OccurrenceSection({
  label,
  items,
  locale,
  timeFormat,
  onOpen,
}: {
  label: string;
  items: OccurrenceListItem[];
  locale: string;
  timeFormat: '12-hour' | '24-hour';
  onOpen: (item: OccurrenceListItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View>
      <Text className="mb-2 ml-1 text-[12px] font-semibold tracking-[1.3px] text-subtle-ink">
        {label}
      </Text>
      <View className="overflow-hidden rounded-[22px] border border-taupe bg-paper">
        {items.map((item, index) => (
          <View key={item.id}>
            {index > 0 ? <View className="ml-[86px] h-px bg-taupe/70" /> : null}
            <Pressable
              accessibilityHint="Opens reminder details and actions"
              accessibilityRole="button"
              className="min-h-[78px] flex-row items-center px-4 py-3 active:bg-canvas"
              onPress={() => onOpen(item)}
            >
              <View className="w-[62px]">
                <Text className="text-[14px] font-semibold text-ink">
                  {formatOccurrenceTime(item, locale, timeFormat)}
                </Text>
                <Text className="mt-0.5 text-[11px] text-subtle-ink">
                  {item.timezone.split('/').at(-1)?.replaceAll('_', ' ')}
                </Text>
              </View>
              <View className="ml-2 flex-1">
                <Text className="text-[16px] font-semibold leading-5 text-ink" numberOfLines={1}>
                  {item.title}
                </Text>
                <Text className="mt-1 text-[13px] text-muted-ink" numberOfLines={1}>
                  {item.contextNote ?? recurrenceLabel(item.scheduleType)}
                </Text>
              </View>
              <Text className="ml-3 text-[24px] font-light text-subtle-ink">›</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <View className="items-center rounded-[24px] border border-taupe bg-paper px-7 py-10">
      <View className="size-14 items-center justify-center rounded-full bg-secondary-fill">
        <View className="size-3 rounded-full bg-subtle-ink" />
      </View>
      <Text className="mt-5 text-center text-[21px] font-semibold text-ink">Nothing scheduled yet</Text>
      <Text className="mt-2 max-w-[300px] text-center text-[14px] leading-6 text-muted-ink">
        Your next reminder will appear here with its exact local time and timezone.
      </Text>
      <Pressable
        accessibilityRole="button"
        className="mt-5 min-h-11 items-center justify-center rounded-full bg-secondary-fill px-5"
        onPress={onCreate}
      >
        <Text className="text-[14px] font-semibold text-ink">Create the first one</Text>
      </Pressable>
    </View>
  );
}

function groupOccurrences(items: OccurrenceListItem[]) {
  const now = Date.now();
  const today = localDayKey(new Date());
  const grouped = {
    overdue: [] as OccurrenceListItem[],
    today: [] as OccurrenceListItem[],
    upcoming: [] as OccurrenceListItem[],
    total: items.length,
  };
  for (const item of items) {
    if (new Date(item.effectiveScheduledAt).getTime() < now) grouped.overdue.push(item);
    else if (item.localDate === today) grouped.today.push(item);
    else grouped.upcoming.push(item);
  }
  return grouped;
}

function occurrenceRange() {
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const to = new Date();
  to.setDate(to.getDate() + 90);
  return { from: from.toISOString(), to: to.toISOString() };
}

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatOccurrenceTime(
  item: OccurrenceListItem,
  locale: string,
  format: '12-hour' | '24-hour',
) {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: format === '12-hour',
    timeZone: item.timezone,
  }).format(new Date(item.effectiveScheduledAt));
}

function recurrenceLabel(type: OccurrenceListItem['scheduleType']) {
  switch (type) {
    case 'ONE_TIME':
      return 'One-time reminder';
    case 'DAILY':
      return 'Repeats every day';
    case 'WEEKLY':
      return 'Repeats weekly';
    case 'SELECTED_WEEKDAYS':
      return 'Repeats on selected days';
  }
}

function formatToday(locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(new Date());
  }
}

function openOccurrence(
  router: ReturnType<typeof useRouter>,
  item: OccurrenceListItem,
) {
  router.push({
    pathname: '/reminders/[reminderId]',
    params: { reminderId: item.reminderId, occurrenceId: item.id },
  });
}
