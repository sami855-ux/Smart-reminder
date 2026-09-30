import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { SymbolIcon, type SymbolName } from '../components/ui/SymbolIcon';
import { useToast } from '../components/ui/ToastProvider';
import { cn } from '../lib/cn';
import { useOnboarding } from '../onboarding/onboarding-context';
import {
  notificationPermissionAllowsAlerts,
  openNotificationSettings,
} from '../platform/notifications/notification-permission';
import { scheduleReminderNotifications } from '../platform/notifications/reminder-notification-scheduler';
import {
  completeOccurrence,
  createIdempotencyKey,
  getReminder,
  listReminderOccurrences,
} from '../reminders/reminder.api';
import type { OccurrenceListItem } from '../reminders/reminder.schemas';

type DashboardFilter = 'TODAY' | 'SCHEDULED' | 'OVERDUE' | 'COMPLETED';

export default function HomeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { status, user } = useAuth();
  const { state } = useOnboarding();
  const [filter, setFilter] = useState<DashboardFilter>('TODAY');
  const [now] = useState(Date.now);
  const range = useMemo(() => occurrenceRange(), []);
  const occurrences = useQuery({
    queryKey: ['reminder-occurrences', 'ALL', range.from, range.to],
    queryFn: () => listReminderOccurrences({ view: 'ALL', ...range, limit: 50 }),
    enabled: status === 'authenticated',
  });
  const completeMutation = useMutation({
    mutationFn: async (item: OccurrenceListItem) => {
      const result = await completeOccurrence({
        occurrenceId: item.id,
        expectedScheduleRevision: item.scheduleRevision,
        expectedEffectiveScheduledAt: item.effectiveScheduledAt,
        idempotencyKey: createIdempotencyKey('complete'),
      });
      const reminder = await getReminder(item.reminderId);
      await scheduleReminderNotifications(reminder);
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reminder-occurrences'] });
      await queryClient.invalidateQueries({ queryKey: ['reminder'] });
      showToast({
        title: 'Reminder completed',
        message: 'The reminder history and local alerts are up to date.',
        tone: 'success',
      });
    },
    onError: (error) => {
      showToast({
        title: 'Couldn’t complete the reminder',
        message: formErrorMessage(error),
        tone: 'error',
      });
    },
  });

  if (status !== 'authenticated' || !user) return <Redirect href="/" />;

  const items = occurrences.data?.items ?? [];
  const dashboard = buildDashboard(items, now);
  const visibleItems = dashboard[filter];
  const permissionAllowed = notificationPermissionAllowsAlerts(
    state.notificationPermission,
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-32"
        refreshControl={
          <RefreshControl
            colors={['#2764E7']}
            refreshing={occurrences.isRefetching}
            tintColor="#2764E7"
            onRefresh={() => void occurrences.refetch()}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full max-w-[720px] self-center">
          <View className="flex-row items-start justify-between px-5 pb-3 pt-2">
            <View className="flex-1 pr-4">
              <Text className="text-[13px] font-semibold text-muted-ink">
                {formatToday(state.preferences.locale)}
              </Text>
              <Text
                accessibilityRole="header"
                className="mt-6 text-[42px] font-bold leading-[48px] tracking-[-1.4px] text-ink"
              >
                Reminders
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Account and settings"
              accessibilityRole="button"
              className="size-12 items-center justify-center rounded-full bg-secondary-fill active:opacity-70"
              onPress={() => router.push('/account')}
            >
              <Text className="text-[17px] font-bold uppercase text-ink">
                {user.email.slice(0, 1)}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            contentContainerClassName="gap-3 px-5 py-4"
            showsHorizontalScrollIndicator={false}
          >
            <CategoryTile
              active={filter === 'TODAY'}
              count={dashboard.TODAY.length}
              icon="today"
              label="Today"
              tone="blue"
              onPress={() => setFilter('TODAY')}
            />
            <CategoryTile
              active={filter === 'SCHEDULED'}
              count={dashboard.SCHEDULED.length}
              icon="scheduled"
              label="Scheduled"
              tone="violet"
              onPress={() => setFilter('SCHEDULED')}
            />
            <CategoryTile
              active={filter === 'OVERDUE'}
              count={dashboard.OVERDUE.length}
              icon="overdue"
              label="Overdue"
              tone="orange"
              onPress={() => setFilter('OVERDUE')}
            />
            <CategoryTile
              active={filter === 'COMPLETED'}
              count={dashboard.COMPLETED.length}
              icon="completed"
              label="Completed"
              tone="green"
              onPress={() => setFilter('COMPLETED')}
            />
          </ScrollView>

          {!permissionAllowed ? (
            <View className="px-5 py-2">
              <PermissionWarning
                onOpenSettings={() => void openNotificationSettings()}
                state={state.notificationPermission}
              />
            </View>
          ) : null}

          <View className="px-5 pt-5">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-[21px] font-bold text-ink">{filterTitle(filter)}</Text>
              <Text className="text-[13px] font-medium text-muted-ink">
                {visibleItems.length} {visibleItems.length === 1 ? 'reminder' : 'reminders'}
              </Text>
            </View>

            {occurrences.isPending ? (
              <LoadingState />
            ) : occurrences.isError ? (
              <ErrorState
                message={formErrorMessage(occurrences.error)}
                onRetry={() => void occurrences.refetch()}
              />
            ) : visibleItems.length === 0 ? (
              <EmptyState filter={filter} onCreate={() => router.push('/create-reminder')} />
            ) : (
              <View className="overflow-hidden rounded-[26px] bg-paper">
                {visibleItems.map((item, index) => (
                  <View key={item.id}>
                    {index > 0 ? <View className="ml-[72px] h-px bg-taupe/70" /> : null}
                    <ReminderRow
                      item={item}
                      locale={state.preferences.locale}
                      now={now}
                      timeFormat={state.preferences.timeFormat}
                      completing={
                        completeMutation.isPending &&
                        completeMutation.variables?.id === item.id
                      }
                      onComplete={() => completeMutation.mutate(item)}
                      onOpen={() =>
                        router.push({
                          pathname: '/reminders/[reminderId]',
                          params: { reminderId: item.reminderId, occurrenceId: item.id },
                        })
                      }
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 items-center px-5 pb-3">
        <Pressable
          accessibilityHint="Opens the new reminder form"
          accessibilityRole="button"
          className="min-h-[60px] w-full max-w-[680px] flex-row items-center rounded-[22px] bg-ink px-4 shadow-lg active:opacity-90"
          onPress={() => router.push('/create-reminder')}
        >
          <View className="size-10 items-center justify-center rounded-full bg-white/15">
            <SymbolIcon className="text-white" name="add" size={28} />
          </View>
          <Text className="ml-3 flex-1 text-[16px] font-semibold text-white">Add a reminder</Text>
          <SymbolIcon className="text-white/60" name="sparkle" size={18} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function CategoryTile({
  label,
  count,
  icon,
  tone,
  active,
  onPress,
}: {
  label: string;
  count: number;
  icon: SymbolName;
  tone: 'blue' | 'violet' | 'orange' | 'green';
  active: boolean;
  onPress: () => void;
}) {
  const tones = {
    blue: ['bg-intelligence-soft', 'bg-intelligence', 'text-intelligence'] as const,
    violet: ['bg-scheduled-soft', 'bg-scheduled', 'text-scheduled'] as const,
    orange: ['bg-warning-soft', 'bg-warning', 'text-warning'] as const,
    green: ['bg-completed-soft', 'bg-completed', 'text-completed'] as const,
  };
  const [tile, badge, iconColor] = tones[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={cn(
        'h-[126px] w-[148px] justify-between rounded-[26px] border-2 p-4',
        tile,
        active ? 'border-ink' : 'border-transparent',
      )}
      onPress={onPress}
    >
      <View className="flex-row items-start justify-between">
        <View className={cn('size-10 items-center justify-center rounded-full bg-white/80', iconColor)}>
          <SymbolIcon className={iconColor} name={icon} size={21} />
        </View>
        <View className={cn('min-w-8 items-center rounded-full px-2 py-1', badge)}>
          <Text className="text-[13px] font-bold text-white">{count}</Text>
        </View>
      </View>
      <Text className="text-[16px] font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}

function ReminderRow({
  item,
  locale,
  now,
  timeFormat,
  completing,
  onComplete,
  onOpen,
}: {
  item: OccurrenceListItem;
  locale: string;
  now: number;
  timeFormat: '12-hour' | '24-hour';
  completing: boolean;
  onComplete: () => void;
  onOpen: () => void;
}) {
  const due = item.lifecycle === 'SCHEDULED' && new Date(item.effectiveScheduledAt).getTime() <= now;
  const terminal = item.lifecycle === 'COMPLETED' || item.lifecycle === 'SKIPPED';
  return (
    <Pressable
      accessibilityHint="Opens reminder details and actions"
      accessibilityRole="button"
      className="min-h-[88px] flex-row items-center px-4 py-3 active:bg-canvas"
      onPress={onOpen}
    >
      <Pressable
        accessibilityLabel={due ? `Complete ${item.title}` : `${item.title} status`}
        accessibilityRole={due ? 'checkbox' : 'image'}
        accessibilityState={due ? { checked: false, busy: completing } : undefined}
        className={cn(
          'size-11 items-center justify-center rounded-full border-2',
          terminal ? 'border-completed bg-completed' : due ? 'border-warning' : 'border-taupe',
        )}
        disabled={!due || completing}
        hitSlop={6}
        onPress={onComplete}
      >
        {completing ? (
          <ActivityIndicator color="#A85E00" size="small" />
        ) : terminal ? (
          <SymbolIcon className="text-white" name="check" size={20} />
        ) : null}
      </Pressable>
      <View className="ml-4 flex-1">
        <Text
          className={cn(
            'text-[16px] font-semibold leading-5 text-ink',
            terminal && 'text-muted-ink line-through',
          )}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <View className="mt-1.5 flex-row items-center">
          <SymbolIcon className={due ? 'text-warning' : 'text-subtle-ink'} name="clock" size={15} />
          <Text className={cn('ml-1.5 text-[13px] text-muted-ink', due && 'font-semibold text-warning')}>
            {formatOccurrence(item, locale, timeFormat)}
          </Text>
        </View>
      </View>
      <SymbolIcon className="ml-3 text-subtle-ink" name="chevron" size={27} />
    </Pressable>
  );
}

function LoadingState() {
  return (
    <View className="items-center rounded-[26px] bg-paper py-14">
      <ActivityIndicator color="#2764E7" />
      <Text className="mt-3 text-[14px] text-muted-ink">Loading reminders…</Text>
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="rounded-[26px] bg-paper p-5">
      <Text className="text-[18px] font-semibold text-ink">Reminders didn’t load</Text>
      <Text className="mt-2 text-[14px] leading-5 text-muted-ink">{message}</Text>
      <Pressable
        accessibilityRole="button"
        className="mt-4 min-h-12 items-center justify-center rounded-2xl bg-secondary-fill"
        onPress={onRetry}
      >
        <Text className="text-[15px] font-semibold text-ink">Try again</Text>
      </Pressable>
    </View>
  );
}

function EmptyState({ filter, onCreate }: { filter: DashboardFilter; onCreate: () => void }) {
  return (
    <View className="items-center rounded-[26px] bg-paper px-7 py-12">
      <View className="size-16 items-center justify-center rounded-full bg-secondary-fill">
        <SymbolIcon className="text-subtle-ink" name={filter === 'COMPLETED' ? 'completed' : 'calendar'} size={28} />
      </View>
      <Text className="mt-5 text-center text-[20px] font-semibold text-ink">
        {emptyTitle(filter)}
      </Text>
      <Text className="mt-2 max-w-[300px] text-center text-[14px] leading-6 text-muted-ink">
        {filter === 'COMPLETED'
          ? 'Completed and skipped reminders will collect here.'
          : 'Create a reminder and it will appear in the right category automatically.'}
      </Text>
      {filter !== 'COMPLETED' ? (
        <Pressable
          accessibilityRole="button"
          className="mt-5 min-h-12 items-center justify-center rounded-full bg-intelligence px-6"
          onPress={onCreate}
        >
          <Text className="text-[14px] font-semibold text-white">Create reminder</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function buildDashboard(
  items: OccurrenceListItem[],
  now: number,
): Record<DashboardFilter, OccurrenceListItem[]> {
  const today = localDayKey(new Date());
  const scheduled = items.filter((item) => item.lifecycle === 'SCHEDULED');
  return {
    TODAY: scheduled.filter((item) => item.localDate === today),
    SCHEDULED: scheduled.filter((item) => new Date(item.effectiveScheduledAt).getTime() >= now),
    OVERDUE: scheduled.filter((item) => new Date(item.effectiveScheduledAt).getTime() < now),
    COMPLETED: items.filter((item) => item.lifecycle === 'COMPLETED' || item.lifecycle === 'SKIPPED'),
  };
}

function occurrenceRange() {
  const from = new Date();
  from.setDate(from.getDate() - 90);
  const to = new Date();
  to.setDate(to.getDate() + 366);
  return { from: from.toISOString(), to: to.toISOString() };
}

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatOccurrence(
  item: OccurrenceListItem,
  locale: string,
  format: '12-hour' | '24-hour',
) {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: format === '12-hour',
    timeZone: item.timezone,
  }).format(new Date(item.effectiveScheduledAt));
}

function formatToday(locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

function filterTitle(filter: DashboardFilter) {
  return {
    TODAY: 'Today',
    SCHEDULED: 'Scheduled',
    OVERDUE: 'Needs attention',
    COMPLETED: 'Completed',
  }[filter];
}

function emptyTitle(filter: DashboardFilter) {
  return {
    TODAY: 'Nothing due today',
    SCHEDULED: 'No upcoming reminders',
    OVERDUE: 'You’re all caught up',
    COMPLETED: 'No completed reminders yet',
  }[filter];
}
