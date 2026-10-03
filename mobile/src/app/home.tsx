import { useEffect, useMemo, useState } from 'react';
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
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useAuth } from '../auth/AuthProvider';
import { formErrorMessage } from '../auth/form-error';
import { AlertDialog } from '../components/ui/AlertDialog';
import { AuthIcon, type AuthIconName } from '../components/ui/AuthIcon';
import { PermissionWarning } from '../components/ui/PermissionWarning';
import { ListSkeleton } from '../components/ui/Skeleton';
import { SymbolIcon } from '../components/ui/SymbolIcon';
import { useToast } from '../components/ui/ToastProvider';
import { cn } from '../lib/cn';
import { useOnboarding } from '../onboarding/onboarding-context';
import {
  notificationPermissionAllowsAlerts,
  openNotificationSettings,
} from '../platform/notifications/notification-permission';
import {
  cancelReminderNotifications,
  scheduleReminderNotifications,
} from '../platform/notifications/reminder-notification-scheduler';
import {
  completeOccurrence,
  createIdempotencyKey,
  deleteReminder,
  getReminder,
  listReminderOccurrences,
} from '../reminders/reminder.api';
import { reminderCachePolicy, reminderQueryKeys } from '../reminders/reminder.queries';
import type { OccurrenceListItem } from '../reminders/reminder.schemas';
import { useAppTheme } from '../theme/theme-context';

type DashboardFilter = 'TODAY' | 'SCHEDULED' | 'OVERDUE' | 'COMPLETED';

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { status, user } = useAuth();
  const { state } = useOnboarding();
  const [filter, setFilter] = useState<DashboardFilter>('TODAY');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [now] = useState(Date.now);
  const range = useMemo(() => occurrenceRange(), []);
  const occurrences = useQuery({
    queryKey: reminderQueryKeys.occurrences('ALL', range.from, range.to),
    queryFn: () => listReminderOccurrences({ view: 'ALL', ...range, limit: 50 }),
    enabled: status === 'authenticated',
    ...reminderCachePolicy,
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
      await queryClient.invalidateQueries({ queryKey: reminderQueryKeys.occurrenceLists() });
      await queryClient.invalidateQueries({ queryKey: reminderQueryKeys.details() });
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
  const bulkCompleteMutation = useMutation({
    mutationFn: async (selectedItems: OccurrenceListItem[]) => {
      const results = await Promise.allSettled(
        selectedItems.map((item) =>
          completeOccurrence({
            occurrenceId: item.id,
            expectedScheduleRevision: item.scheduleRevision,
            expectedEffectiveScheduledAt: item.effectiveScheduledAt,
            idempotencyKey: createIdempotencyKey('bulk-complete'),
          }),
        ),
      );
      const completedItems = selectedItems.filter((_, index) => results[index]?.status === 'fulfilled');
      const failures = results.filter((result) => result.status === 'rejected');
      if (completedItems.length === 0 && failures[0]?.status === 'rejected') {
        throw failures[0].reason;
      }

      const reminderIds = [...new Set(completedItems.map((item) => item.reminderId))];
      const scheduling = await Promise.allSettled(
        reminderIds.map(async (reminderId) => {
          const reminder = await getReminder(reminderId);
          return scheduleReminderNotifications(reminder);
        }),
      );
      return {
        completedCount: completedItems.length,
        failedCount: failures.length,
        schedulingFailed: scheduling.some((result) => result.status === 'rejected'),
      };
    },
    onSuccess: async ({ completedCount, failedCount, schedulingFailed }) => {
      await queryClient.invalidateQueries({ queryKey: reminderQueryKeys.occurrenceLists() });
      await queryClient.invalidateQueries({ queryKey: reminderQueryKeys.details() });
      setBulkDialogOpen(false);
      setSelectionMode(false);
      setSelectedIds(new Set());
      showToast({
        title: `${completedCount} reminder${completedCount === 1 ? '' : 's'} completed`,
        message:
          failedCount > 0
            ? `${failedCount} could not be completed. The list has been refreshed.`
            : schedulingFailed
              ? 'The reminders were completed, but some device alerts need attention.'
              : 'Reminder history and device alerts are up to date.',
        tone: failedCount > 0 || schedulingFailed ? 'info' : 'success',
      });
    },
    onError: (error) => {
      setBulkDialogOpen(false);
      showToast({
        title: 'Couldn’t complete the selected reminders',
        message: formErrorMessage(error),
        tone: 'error',
      });
    },
  });
  const bulkDeleteMutation = useMutation({
    mutationFn: async (selectedItems: OccurrenceListItem[]) => {
      const uniqueItems = [
        ...new Map(selectedItems.map((item) => [item.reminderId, item])).values(),
      ];
      const results = await Promise.allSettled(
        uniqueItems.map(async (item) => {
          const reminder = await getReminder(item.reminderId);
          await deleteReminder({
            reminderId: reminder.id,
            expectedRevision: reminder.revision,
            idempotencyKey: createIdempotencyKey('bulk-delete'),
          });
          await cancelReminderNotifications(reminder).catch(() => undefined);
          return reminder.id;
        }),
      );
      const deletedIds = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      const failures = results.filter((result) => result.status === 'rejected');
      if (deletedIds.length === 0 && failures[0]?.status === 'rejected') {
        throw failures[0].reason;
      }
      return {
        deletedIds,
        failedCount: failures.length,
      };
    },
    onSuccess: async ({ deletedIds, failedCount }) => {
      deletedIds.forEach((reminderId) => {
        queryClient.removeQueries({ queryKey: reminderQueryKeys.detail(reminderId) });
      });
      await queryClient.invalidateQueries({ queryKey: reminderQueryKeys.occurrenceLists() });
      setBulkDeleteDialogOpen(false);
      setSelectionMode(false);
      setSelectedIds(new Set());
      showToast({
        title: `${deletedIds.length} reminder${deletedIds.length === 1 ? '' : 's'} deleted`,
        message:
          failedCount > 0
            ? `${failedCount} could not be deleted. The list has been refreshed.`
            : 'Their pending device alerts were cancelled.',
        tone: failedCount > 0 ? 'info' : 'success',
      });
    },
    onError: (error) => {
      setBulkDeleteDialogOpen(false);
      showToast({
        title: 'Couldn’t delete the selected reminders',
        message: formErrorMessage(error),
        tone: 'error',
      });
    },
  });

  if (status !== 'authenticated' || !user) return <Redirect href="/" />;

  const items = occurrences.data?.items ?? [];
  const dashboard = buildDashboard(items, now);
  const visibleItems = dashboard[filter];
  const selectedItems = visibleItems.filter((item) => selectedIds.has(item.id));
  const canCompleteSelection =
    selectedItems.length > 0 && selectedItems.every((item) => isCompletable(item, now));
  const selectionBusy = bulkCompleteMutation.isPending || bulkDeleteMutation.isPending;
  const permissionAllowed = notificationPermissionAllowsAlerts(
    state.notificationPermission,
  );

  function changeFilter(next: DashboardFilter) {
    setFilter(next);
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function beginSelection(item: OccurrenceListItem) {
    setSelectionMode(true);
    setSelectedIds(new Set([item.id]));
  }

  function toggleSelection(item: OccurrenceListItem) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  function closeSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelectAll() {
    setSelectedIds((current) =>
      current.size === visibleItems.length
        ? new Set()
        : new Set(visibleItems.map((item) => item.id)),
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-32"
        refreshControl={
          <RefreshControl
            colors={[colors.accent]}
            refreshing={occurrences.isRefetching}
            tintColor={colors.accent}
            onRefresh={() => void occurrences.refetch()}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full max-w-[720px] self-center">
          <View className="flex-row items-center justify-between px-5 pb-4 pt-3">
            <View className="flex-1 pr-4">
              <Text className="font-inter-medium text-[13px] text-muted-foreground">
                {formatToday(state.preferences.locale)}
              </Text>
              <Text
                accessibilityRole="header"
                className="mt-2 font-inter-bold text-[32px] leading-[38px] text-foreground"
              >
                Reminders
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Account and settings"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-[14px] bg-ink active:opacity-70"
              onPress={() => router.push('/account')}
            >
              <Text className="font-inter-bold text-[16px] uppercase text-kast-lime">
                {user.email.slice(0, 1)}
              </Text>
            </Pressable>
          </View>

          <FilterTabs value={filter} onChange={changeFilter} />

          {!permissionAllowed ? (
            <View className="px-5 py-2">
              <PermissionWarning
                onOpenSettings={() => void openNotificationSettings()}
                state={state.notificationPermission}
              />
            </View>
          ) : null}

          <View className="px-5 pt-6">
            <View className="mb-3 flex-row items-center justify-between">
              <View>
                <Text className="font-inter-semibold text-[18px] text-foreground">
                  {selectionMode ? `${selectedIds.size} selected` : filterTitle(filter)}
                </Text>
                {!selectionMode ? (
                  <Text className="mt-1 font-inter text-[12px] tabular-nums text-muted-foreground">
                    {visibleItems.length} {visibleItems.length === 1 ? 'reminder' : 'reminders'}
                  </Text>
                ) : null}
              </View>
              {selectionMode ? (
                <Pressable
                  accessibilityRole="button"
                  className="min-h-10 justify-center rounded-full bg-secondary-fill px-4"
                  onPress={toggleSelectAll}
                >
                  <Text className="font-inter-semibold text-[13px] text-foreground">
                    {selectedIds.size === visibleItems.length ? 'Clear all' : 'Select all'}
                  </Text>
                </Pressable>
              ) : null}
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
              <View className="overflow-hidden rounded-[18px] bg-paper">
                {visibleItems.map((item, index) => (
                  <View key={item.id}>
                    {index > 0 ? <View className="ml-[72px] h-px bg-secondary-fill" /> : null}
                    <ReminderRow
                      item={item}
                      locale={state.preferences.locale}
                      now={now}
                      selected={selectedIds.has(item.id)}
                      selecting={selectionMode}
                      timeFormat={state.preferences.timeFormat}
                      completing={
                        completeMutation.isPending &&
                        completeMutation.variables?.id === item.id
                      }
                      onComplete={() => completeMutation.mutate(item)}
                      onLongPress={() => beginSelection(item)}
                      onOpen={() =>
                        router.push({
                          pathname: '/reminders/[reminderId]',
                          params: { reminderId: item.reminderId, occurrenceId: item.id },
                        })
                      }
                      onToggleSelection={() => toggleSelection(item)}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {selectionMode ? (
        <View className="absolute inset-x-0 bottom-0 border-t border-taupe/70 bg-paper pb-2 pt-1">
          <View className="w-full max-w-[680px] flex-row self-center px-3">
            <SelectionToolbarAction
              disabled={selectionBusy}
              icon="close"
              label="Done"
              onPress={closeSelection}
            />
            <SelectionToolbarAction
              disabled={!canCompleteSelection || selectionBusy}
              icon="check"
              label="Complete"
              tone="primary"
              onPress={() => setBulkDialogOpen(true)}
            />
            <SelectionToolbarAction
              disabled={selectedItems.length === 0 || selectionBusy}
              icon="trash"
              label="Delete"
              tone="destructive"
              onPress={() => setBulkDeleteDialogOpen(true)}
            />
          </View>
        </View>
      ) : (
        <View className="absolute inset-x-0 bottom-0 items-center px-5 pb-3">
          <Pressable
            accessibilityHint="Opens the new reminder form"
            accessibilityRole="button"
            android_ripple={{ color: 'rgba(18, 21, 16, 0.10)' }}
            className="min-h-[62px] w-full max-w-[680px] flex-row items-center overflow-hidden rounded-[18px] bg-kast-lime px-3 active:opacity-90"
            onPress={() => router.push('/create-reminder')}
          >
            <View className="size-11 items-center justify-center rounded-[14px] bg-ink">
              <SymbolIcon className="text-kast-lime" name="add" size={24} />
            </View>
            <Text className="ml-3 flex-1 font-inter-bold text-[16px] text-ink">Add reminder</Text>
            <View className="size-9 items-center justify-center rounded-full bg-ink">
              <SymbolIcon className="text-white" name="chevron" size={22} />
            </View>
          </Pressable>
        </View>
      )}

      <AlertDialog
        confirmLabel="Complete selected"
        loading={bulkCompleteMutation.isPending}
        message={`This will mark ${selectedItems.length} reminder${selectedItems.length === 1 ? '' : 's'} complete and refresh their device alerts.`}
        title="Complete selected reminders?"
        visible={bulkDialogOpen}
        onCancel={() => setBulkDialogOpen(false)}
        onConfirm={() => bulkCompleteMutation.mutate(selectedItems)}
      />
      <AlertDialog
        confirmLabel="Delete selected"
        loading={bulkDeleteMutation.isPending}
        message={`This permanently deletes ${selectedItems.length} reminder${selectedItems.length === 1 ? '' : 's'}, including every occurrence and pending device alert.`}
        title="Delete selected reminders?"
        tone="destructive"
        visible={bulkDeleteDialogOpen}
        onCancel={() => setBulkDeleteDialogOpen(false)}
        onConfirm={() => bulkDeleteMutation.mutate(selectedItems)}
      />
    </SafeAreaView>
  );
}

function SelectionToolbarAction({
  icon,
  label,
  disabled,
  tone = 'default',
  onPress,
}: {
  icon: AuthIconName;
  label: string;
  disabled: boolean;
  tone?: 'default' | 'primary' | 'destructive';
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const iconColor = disabled
    ? colors.muted
    : tone === 'destructive'
      ? '#B94A42'
      : tone === 'primary'
        ? colors.accent
        : colors.foreground;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(
        'min-h-[64px] flex-1 items-center justify-center active:opacity-55',
        disabled && 'opacity-40',
      )}
      disabled={disabled}
      onPress={onPress}
    >
      <AuthIcon color={iconColor} name={icon} size={22} />
      <Text
        className={cn(
          'mt-1.5 font-inter-medium text-[11px]',
          tone === 'destructive'
            ? 'text-urgent'
            : tone === 'primary'
              ? 'text-accent'
              : 'text-foreground',
          disabled && 'text-muted-foreground',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const filterOptions: {
  value: DashboardFilter;
  label: string;
}[] = [
  { value: 'TODAY', label: 'Today' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'COMPLETED', label: 'Completed' },
];

function FilterTabs({
  value,
  onChange,
}: {
  value: DashboardFilter;
  onChange: (value: DashboardFilter) => void;
}) {
  const selectedIndex = filterOptions.findIndex((option) => option.value === value);
  const progress = useSharedValue(selectedIndex);
  const segmentWidth = useSharedValue(0);

  useEffect(() => {
    progress.set(
      withTiming(selectedIndex, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [progress, selectedIndex]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: segmentWidth.value,
    transform: [{ translateX: progress.value * segmentWidth.value }],
  }));

  return (
    <View
      className="relative mx-5 my-2 h-11 flex-row rounded-[10px] bg-secondary-fill p-0.5"
      onLayout={(event) => {
        segmentWidth.set((event.nativeEvent.layout.width - 4) / filterOptions.length);
      }}
    >
      <Animated.View
        className="absolute bottom-0.5 left-0.5 top-0.5 rounded-[8px] bg-paper"
        pointerEvents="none"
        style={[
          {
            elevation: 1,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.14,
            shadowRadius: 2.5,
          },
          indicatorStyle,
        ]}
      />
      {filterOptions.map((option) => (
        <FilterTab
          key={option.value}
          active={value === option.value}
          label={option.label}
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}

function FilterTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="z-10 h-10 flex-1 items-center justify-center rounded-[8px]"
      onPress={onPress}
    >
      <Text
        className={cn(
          'font-inter-semibold text-[13px]',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ReminderRow({
  item,
  locale,
  now,
  timeFormat,
  completing,
  selecting,
  selected,
  onComplete,
  onOpen,
  onLongPress,
  onToggleSelection,
}: {
  item: OccurrenceListItem;
  locale: string;
  now: number;
  timeFormat: '12-hour' | '24-hour';
  completing: boolean;
  selecting: boolean;
  selected: boolean;
  onComplete: () => void;
  onOpen: () => void;
  onLongPress: () => void;
  onToggleSelection: () => void;
}) {
  const due = item.lifecycle === 'SCHEDULED' && new Date(item.effectiveScheduledAt).getTime() <= now;
  const terminal = item.lifecycle === 'COMPLETED' || item.lifecycle === 'SKIPPED';
  const recurring = item.scheduleType !== 'ONE_TIME';
  return (
    <Pressable
      accessibilityHint={selecting ? 'Adds or removes this reminder from the selection' : 'Opens reminder details and actions'}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? { checked: selected } : undefined}
      className={cn(
        'min-h-[88px] flex-row items-center px-4 py-3 active:bg-canvas',
        selected && 'bg-intelligence-soft',
      )}
      onLongPress={onLongPress}
      onPress={selecting ? onToggleSelection : onOpen}
    >
      {selecting ? (
        <View
          className={cn(
            'size-11 items-center justify-center rounded-full border-2',
            selected ? 'border-ink bg-ink' : 'border-taupe bg-paper',
          )}
        >
          {selected ? <SymbolIcon className="text-kast-lime" name="check" size={19} /> : null}
        </View>
      ) : (
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
          onLongPress={onLongPress}
          onPress={onComplete}
        >
          {completing ? (
            <ActivityIndicator color="#96601D" size="small" />
          ) : terminal ? (
            <SymbolIcon className="text-white" name="check" size={20} />
          ) : null}
        </Pressable>
      )}
      <View className="ml-4 flex-1">
        <Text
          className={cn(
            'font-inter-semibold text-[16px] leading-5 text-foreground',
            terminal && !recurring && 'text-muted-foreground line-through',
          )}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <View className="mt-1.5 flex-row items-center">
          <SymbolIcon
            className={due ? 'text-warning' : 'text-subtle-foreground'}
            name={recurring ? 'repeat' : 'clock'}
            size={15}
          />
          <Text className={cn('ml-1.5 font-inter text-[13px] tabular-nums text-muted-foreground', due && 'font-inter-semibold text-warning')}>
            {recurring ? recurringOccurrenceLabel(item, due) : null}
            {formatOccurrence(item, locale, timeFormat)}
          </Text>
        </View>
      </View>
      {!selecting ? <SymbolIcon className="ml-3 text-subtle-foreground" name="chevron" size={27} /> : null}
    </Pressable>
  );
}

function LoadingState() {
  return <ListSkeleton rows={4} />;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="rounded-[18px] border border-taupe bg-paper p-5">
      <Text className="font-inter-semibold text-[18px] text-foreground">Reminders didn’t load</Text>
      <Text className="mt-2 font-inter text-[14px] leading-5 text-muted-foreground">{message}</Text>
      <Pressable
        accessibilityRole="button"
        className="mt-4 min-h-12 items-center justify-center rounded-[14px] bg-secondary-fill"
        onPress={onRetry}
      >
        <Text className="font-inter-semibold text-[15px] text-foreground">Try again</Text>
      </Pressable>
    </View>
  );
}

function EmptyState({ filter, onCreate }: { filter: DashboardFilter; onCreate: () => void }) {
  return (
    <View className="items-center rounded-[18px] border border-taupe bg-paper px-7 py-12">
      <View className="size-16 items-center justify-center rounded-full bg-secondary-fill">
        <SymbolIcon className="text-subtle-foreground" name={filter === 'COMPLETED' ? 'completed' : 'calendar'} size={28} />
      </View>
      <Text className="mt-5 text-center font-inter-semibold text-[20px] text-foreground">
        {emptyTitle(filter)}
      </Text>
      <Text className="mt-2 max-w-[300px] text-center font-inter text-[14px] leading-6 text-muted-foreground">
        {filter === 'COMPLETED'
          ? 'Completed and skipped reminders will collect here.'
          : 'Create a reminder and it will appear in the right category automatically.'}
      </Text>
      {filter !== 'COMPLETED' ? (
        <Pressable
          accessibilityRole="button"
          className="mt-5 min-h-12 items-center justify-center rounded-[14px] bg-intelligence px-6"
          onPress={onCreate}
        >
          <Text className="font-inter-semibold text-[14px] text-white">Create reminder</Text>
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
    TODAY: collapseReminderSeries(
      scheduled.filter((item) => item.localDate === today),
      'earliest',
    ),
    SCHEDULED: collapseReminderSeries(
      scheduled.filter((item) => new Date(item.effectiveScheduledAt).getTime() >= now),
      'earliest',
    ),
    OVERDUE: collapseReminderSeries(
      scheduled.filter((item) => new Date(item.effectiveScheduledAt).getTime() < now),
      'earliest',
    ),
    COMPLETED: collapseReminderSeries(
      items.filter((item) => item.lifecycle === 'COMPLETED' || item.lifecycle === 'SKIPPED'),
      'latest',
    ).sort(compareOccurrencesDescending),
  };
}

function collapseReminderSeries(
  items: OccurrenceListItem[],
  keep: 'earliest' | 'latest',
) {
  const byReminder = new Map<string, OccurrenceListItem>();

  for (const item of items) {
    const current = byReminder.get(item.reminderId);
    if (!current) {
      byReminder.set(item.reminderId, item);
      continue;
    }

    const itemTime = new Date(item.effectiveScheduledAt).getTime();
    const currentTime = new Date(current.effectiveScheduledAt).getTime();
    if (
      (keep === 'earliest' && itemTime < currentTime) ||
      (keep === 'latest' && itemTime > currentTime)
    ) {
      byReminder.set(item.reminderId, item);
    }
  }

  return [...byReminder.values()].sort(compareOccurrencesAscending);
}

function compareOccurrencesAscending(left: OccurrenceListItem, right: OccurrenceListItem) {
  return (
    new Date(left.effectiveScheduledAt).getTime() -
    new Date(right.effectiveScheduledAt).getTime()
  );
}

function compareOccurrencesDescending(left: OccurrenceListItem, right: OccurrenceListItem) {
  return compareOccurrencesAscending(right, left);
}

function isCompletable(item: OccurrenceListItem, now: number) {
  return (
    item.lifecycle === 'SCHEDULED' &&
    new Date(item.effectiveScheduledAt).getTime() <= now
  );
}

function occurrenceRange() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - 90);
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  to.setDate(to.getDate() + 367);
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

function recurringOccurrenceLabel(item: OccurrenceListItem, due: boolean) {
  if (item.lifecycle === 'COMPLETED') return 'Last completed · ';
  if (item.lifecycle === 'SKIPPED') return 'Last skipped · ';
  return due ? 'Current occurrence · ' : 'Next occurrence · ';
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
