import { useMemo, useRef, useState } from 'react';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthProvider';
import { formErrorMessage } from '../../auth/form-error';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/ToastProvider';
import { cn } from '../../lib/cn';
import { useOnboarding } from '../../onboarding/onboarding-context';
import { scheduleReminderNotifications } from '../../platform/notifications/reminder-notification-scheduler';
import {
  createIdempotencyKey,
  editReminderSchedule,
  getReminder,
  snoozeOccurrence,
} from '../../reminders/reminder.api';
import type { ReminderDetail } from '../../reminders/reminder.schemas';

type EditScope = 'THIS_OCCURRENCE' | 'THIS_AND_FUTURE';
type PickerMode = 'date' | 'time' | null;

export default function ReminderDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ reminderId: string; occurrenceId?: string }>();
  const { status } = useAuth();
  const { state } = useOnboarding();
  const { showToast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const detail = useQuery({
    queryKey: ['reminder', params.reminderId],
    queryFn: () => getReminder(params.reminderId),
    enabled: status === 'authenticated' && Boolean(params.reminderId),
  });
  const selected = useMemo(() => {
    const items = detail.data?.occurrences ?? [];
    return (
      items.find((item) => item.id === params.occurrenceId) ??
      items.find((item) => item.lifecycle === 'SCHEDULED') ??
      items[0]
    );
  }, [detail.data?.occurrences, params.occurrenceId]);

  const snoozeMutation = useMutation({
    mutationFn: async (minutes: number) => {
      if (!selected) throw new Error('Occurrence unavailable.');
      const until = new Date(Date.now() + minutes * 60_000).toISOString();
      await snoozeOccurrence({
        occurrenceId: selected.id,
        idempotencyKey: createIdempotencyKey('snooze'),
        until,
        expectedScheduleRevision: selected.scheduleRevision,
        expectedEffectiveScheduledAt: selected.effectiveScheduledAt,
      });
      return minutes;
    },
    onSuccess: async (minutes) => {
      const refreshed = await detail.refetch();
      if (refreshed.data) await scheduleReminderNotifications(refreshed.data);
      await queryClient.invalidateQueries({ queryKey: ['reminder-occurrences'] });
      showToast({
        title: 'Reminder snoozed',
        message: `This occurrence moved by ${formatDuration(minutes)}. Later occurrences did not change.`,
        tone: 'success',
      });
    },
    onError: (error) => {
      showToast({
        title: 'Couldn’t snooze this occurrence',
        message: formErrorMessage(error),
        tone: 'error',
      });
    },
  });

  if (status !== 'authenticated') return <Redirect href="/" />;

  return (
    <>
      <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
        <View className="h-14 flex-row items-center justify-between px-3">
          <Pressable
            accessibilityLabel="Back to reminders"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full active:bg-secondary-fill"
            onPress={() => router.back()}
          >
            <Text className="text-[30px] font-light text-ink">‹</Text>
          </Pressable>
          <Text className="text-[13px] font-semibold tracking-[1.1px] text-subtle-ink">REMINDER</Text>
          <View className="size-11" />
        </View>

        {detail.isPending ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#262626" />
          </View>
        ) : detail.isError || !detail.data || !selected ? (
          <View className="flex-1 justify-center px-5">
            <View className="rounded-[22px] border border-taupe bg-paper p-5">
              <Text className="text-[20px] font-semibold text-ink">Reminder unavailable</Text>
              <Text className="mt-2 text-[14px] leading-5 text-muted-ink">
                {detail.error ? formErrorMessage(detail.error) : 'This reminder has no occurrences.'}
              </Text>
              <View className="mt-5">
                <Button label="Try again" onPress={() => void detail.refetch()} variant="secondary" />
              </View>
            </View>
          </View>
        ) : (
          <ReminderContent
            detail={detail.data}
            locale={state.preferences.locale}
            onEdit={() => setEditOpen(true)}
            onSnooze={(minutes) => snoozeMutation.mutate(minutes)}
            selected={selected}
            snoozing={snoozeMutation.isPending}
            timeFormat={state.preferences.timeFormat}
          />
        )}
      </SafeAreaView>

      {detail.data && selected && editOpen ? (
        <RescheduleModal
          detail={detail.data}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            setEditOpen(false);
            const refreshed = await detail.refetch();
            if (refreshed.data) await scheduleReminderNotifications(refreshed.data);
            await queryClient.invalidateQueries({ queryKey: ['reminder-occurrences'] });
          }}
          occurrence={selected}
          showToast={showToast}
        />
      ) : null}
    </>
  );
}

function ReminderContent({
  detail,
  selected,
  locale,
  timeFormat,
  snoozing,
  onSnooze,
  onEdit,
}: {
  detail: ReminderDetail;
  selected: ReminderDetail['occurrences'][number];
  locale: string;
  timeFormat: '12-hour' | '24-hour';
  snoozing: boolean;
  onSnooze: (minutes: number) => void;
  onEdit: () => void;
}) {
  const when = formatOccurrence(selected.effectiveScheduledAt, detail.schedule.timezone, locale, timeFormat);
  return (
    <ScrollView className="flex-1" contentContainerClassName="pb-14" showsVerticalScrollIndicator={false}>
      <View className="w-full max-w-[680px] self-center px-5">
        <View className="rounded-[26px] bg-ink p-6">
          <Text className="text-[12px] font-semibold tracking-[1.2px] text-white/55">
            {selected.lifecycle}
          </Text>
          <Text className="mt-4 text-[30px] font-bold leading-[36px] tracking-[-0.6px] text-white">
            {detail.title}
          </Text>
          {detail.contextNote ? (
            <Text className="mt-3 text-[15px] leading-6 text-white/70">{detail.contextNote}</Text>
          ) : null}
          <View className="mt-6 border-t border-white/15 pt-5">
            <Text className="text-[18px] font-semibold text-white">{when}</Text>
            <Text className="mt-1 text-[13px] text-white/55">{detail.schedule.timezone}</Text>
          </View>
        </View>

        <Text className="mb-2 ml-1 mt-7 text-[12px] font-semibold tracking-[1.2px] text-subtle-ink">
          SCHEDULE
        </Text>
        <View className="overflow-hidden rounded-[20px] border border-taupe bg-paper">
          <DetailRow label="Repeats" value={recurrenceLabel(detail)} />
          <View className="ml-4 h-px bg-taupe/70" />
          <DetailRow label="Local time" value={`${selected.localDate} · ${selected.localTime}`} />
          <View className="ml-4 h-px bg-taupe/70" />
          <DetailRow label="Revision" value={`Schedule ${selected.scheduleRevision}`} />
        </View>

        {selected.lifecycle === 'SCHEDULED' ? (
          <>
            <Text className="mb-2 ml-1 mt-7 text-[12px] font-semibold tracking-[1.2px] text-subtle-ink">
              SNOOZE THIS OCCURRENCE
            </Text>
            <View className="flex-row gap-2">
              {[10, 30, 60].map((minutes) => (
                <Pressable
                  key={minutes}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: snoozing }}
                  className="min-h-12 flex-1 items-center justify-center rounded-2xl border border-taupe bg-paper active:bg-secondary-fill disabled:opacity-50"
                  disabled={snoozing}
                  onPress={() => onSnooze(minutes)}
                >
                  <Text className="text-[14px] font-semibold text-ink">
                    {minutes === 60 ? '1 hour' : `${minutes} min`}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View className="mt-3">
              <Button label="Reschedule" onPress={onEdit} variant="secondary" />
            </View>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

function RescheduleModal({
  detail,
  occurrence,
  onClose,
  onSaved,
  showToast,
}: {
  detail: ReminderDetail;
  occurrence: ReminderDetail['occurrences'][number];
  onClose: () => void;
  onSaved: () => Promise<void>;
  showToast: ReturnType<typeof useToast>['showToast'];
}) {
  const recurring = detail.schedule.type !== 'ONE_TIME';
  const [scope, setScope] = useState<EditScope>(
    recurring ? 'THIS_OCCURRENCE' : 'THIS_OCCURRENCE',
  );
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [dateTime, setDateTime] = useState(() =>
    fromLocalParts(occurrence.localDate, occurrence.localTime),
  );
  const key = useRef(createIdempotencyKey('reschedule'));
  const mutation = useMutation({
    mutationFn: () =>
      editReminderSchedule({
        reminderId: detail.id,
        idempotencyKey: key.current,
        occurrenceId: occurrence.id,
        scope,
        expectedReminderRevision: detail.revision,
        expectedEffectiveScheduledAt: occurrence.effectiveScheduledAt,
        schedule: buildEditedSchedule(detail, occurrence, scope, dateTime),
      }),
    onSuccess: async () => {
      await onSaved();
      showToast({
        title: 'Schedule updated',
        message:
          scope === 'THIS_OCCURRENCE'
            ? 'Only this occurrence changed.'
            : 'This and future occurrences now use a new schedule revision.',
        tone: 'success',
      });
    },
    onError: (error) => {
      showToast({ title: 'Couldn’t update the schedule', message: formErrorMessage(error), tone: 'error' });
    },
  });

  function onPickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setPickerMode(null);
    if (event.type !== 'set' || !selected) return;
    const next = new Date(dateTime);
    if (pickerMode === 'date') next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    else next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    setDateTime(next);
    key.current = createIdempotencyKey('reschedule');
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <SafeAreaView className="flex-1 bg-canvas">
        <View className="h-14 flex-row items-center justify-between border-b border-taupe px-4">
          <Pressable accessibilityRole="button" className="min-h-11 justify-center pr-3" onPress={onClose}>
            <Text className="text-[16px] font-medium text-muted-ink">Cancel</Text>
          </Pressable>
          <Text className="text-[16px] font-semibold text-ink">Reschedule</Text>
          <View className="w-[58px]" />
        </View>
        <ScrollView contentContainerClassName="px-5 pb-10 pt-6">
          <Text className="text-[28px] font-bold tracking-[-0.5px] text-ink">Choose the new time</Text>
          <Text className="mt-2 text-[15px] leading-6 text-muted-ink">
            The schedule timezone stays {detail.schedule.timezone}.
          </Text>

          {recurring ? (
            <View className="mt-6 gap-2">
              <Text className="mb-1 text-[12px] font-semibold tracking-[1.1px] text-subtle-ink">APPLY TO</Text>
              <ScopeChoice
                description="Keeps every later occurrence where it is"
                label="This occurrence only"
                onPress={() => setScope('THIS_OCCURRENCE')}
                selected={scope === 'THIS_OCCURRENCE'}
              />
              <ScopeChoice
                description="Creates a new revision and preserves history"
                label="This and all future occurrences"
                onPress={() => setScope('THIS_AND_FUTURE')}
                selected={scope === 'THIS_AND_FUTURE'}
              />
            </View>
          ) : null}

          <View className="mt-6 overflow-hidden rounded-[20px] border border-taupe bg-paper">
            <DateRow label="Date" onPress={() => setPickerMode('date')} value={formatLocalDate(dateTime)} />
            <View className="ml-4 h-px bg-taupe/70" />
            <DateRow label="Time" onPress={() => setPickerMode('time')} value={formatLocalTime(dateTime)} />
          </View>

          {pickerMode ? (
            <View className="mt-4 rounded-[20px] bg-paper p-3">
              <DateTimePicker
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={pickerMode === 'date' ? new Date() : undefined}
                mode={pickerMode}
                onChange={onPickerChange}
                value={dateTime}
              />
              {Platform.OS === 'ios' ? (
                <Pressable className="min-h-11 items-center justify-center rounded-xl bg-secondary-fill" onPress={() => setPickerMode(null)}>
                  <Text className="text-[15px] font-semibold text-ink">Done</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View className="mt-7">
            <Button label="Save schedule" loading={mutation.isPending} onPress={() => mutation.mutate()} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ScopeChoice({ label, description, selected, onPress }: { label: string; description: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={cn('min-h-[70px] flex-row items-center rounded-[18px] border p-4', selected ? 'border-ink bg-paper' : 'border-taupe bg-paper')}
      onPress={onPress}
    >
      <View className={cn('size-5 items-center justify-center rounded-full border', selected ? 'border-ink' : 'border-subtle-ink')}>
        {selected ? <View className="size-2.5 rounded-full bg-ink" /> : null}
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-[15px] font-semibold text-ink">{label}</Text>
        <Text className="mt-1 text-[12px] leading-4 text-muted-ink">{description}</Text>
      </View>
    </Pressable>
  );
}

function DateRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" className="min-h-[58px] flex-row items-center px-4 active:bg-canvas" onPress={onPress}>
      <Text className="flex-1 text-[16px] font-medium text-ink">{label}</Text>
      <Text className="text-[15px] text-muted-ink">{value}</Text>
      <Text className="ml-2 text-[22px] font-light text-subtle-ink">›</Text>
    </Pressable>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-h-[56px] flex-row items-center px-4 py-3">
      <Text className="flex-1 text-[15px] text-muted-ink">{label}</Text>
      <Text className="ml-4 max-w-[60%] text-right text-[14px] font-medium text-ink">{value}</Text>
    </View>
  );
}

function buildEditedSchedule(
  detail: ReminderDetail,
  occurrence: ReminderDetail['occurrences'][number],
  scope: EditScope,
  dateTime: Date,
) {
  if (scope === 'THIS_OCCURRENCE') {
    return {
      type: 'ONE_TIME' as const,
      localDate: formatLocalDate(dateTime),
      localTime: formatLocalTime(dateTime),
      timezone: detail.schedule.timezone,
    };
  }
  const remainingCount = detail.schedule.occurrenceCount
    ? Math.max(1, detail.schedule.occurrenceCount - occurrence.sequence + 1)
    : null;
  const localDate = formatLocalDate(dateTime);
  return {
    type: detail.schedule.type,
    localDate,
    localTime: formatLocalTime(dateTime),
    timezone: detail.schedule.timezone,
    ...(detail.schedule.type === 'SELECTED_WEEKDAYS'
      ? { weekdays: detail.schedule.weekdays }
      : {}),
    ...(remainingCount ? { occurrenceCount: remainingCount } : {}),
    ...(detail.schedule.endDate && detail.schedule.endDate >= localDate
      ? { endDate: detail.schedule.endDate }
      : {}),
  };
}

function recurrenceLabel(detail: ReminderDetail) {
  switch (detail.schedule.type) {
    case 'ONE_TIME':
      return 'Does not repeat';
    case 'DAILY':
      return 'Every day';
    case 'WEEKLY':
      return 'Every week';
    case 'SELECTED_WEEKDAYS':
      return `Selected weekdays · ${detail.schedule.weekdays.join(', ')}`;
  }
}

function formatOccurrence(instant: string, timezone: string, locale: string, format: '12-hour' | '24-hour') {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
    hour12: format === '12-hour', timeZone: timezone,
  }).format(new Date(instant));
}

function fromLocalParts(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year!, month! - 1, day!, hour!, minute!);
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatLocalTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDuration(minutes: number) {
  return minutes === 60 ? '1 hour' : `${minutes} minutes`;
}
