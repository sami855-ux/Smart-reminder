import { useMemo, useRef, useState } from 'react';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthProvider';
import { formErrorMessage } from '../../auth/form-error';
import { Button } from '../../components/ui/Button';
import { OneUIHeader } from '../../components/ui/OneUIHeader';
import { SymbolIcon, type SymbolName } from '../../components/ui/SymbolIcon';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/ToastProvider';
import { cn } from '../../lib/cn';
import { useOnboarding } from '../../onboarding/onboarding-context';
import {
  cancelReminderNotifications,
  scheduleReminderNotifications,
} from '../../platform/notifications/reminder-notification-scheduler';
import {
  completeOccurrence,
  createIdempotencyKey,
  deleteReminder,
  editReminderSchedule,
  getNudgePolicy,
  getOccurrenceExplanation,
  getReminder,
  listReminderEvents,
  skipOccurrence,
  snoozeOccurrence,
  updateNudgePolicy,
  updateReminderContent,
} from '../../reminders/reminder.api';
import type { ReminderDetail } from '../../reminders/reminder.schemas';

type EditScope = 'THIS_OCCURRENCE' | 'THIS_AND_FUTURE';
type PickerMode = 'date' | 'time' | null;
type TerminalAction = 'complete' | 'skip';

export default function ReminderDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ reminderId: string; occurrenceId?: string }>();
  const { status } = useAuth();
  const { state } = useOnboarding();
  const { showToast } = useToast();
  const [now] = useState(Date.now);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [editContentOpen, setEditContentOpen] = useState(false);

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
  const explanation = useQuery({
    queryKey: ['occurrence-explanation', selected?.id],
    queryFn: () => getOccurrenceExplanation(selected!.id),
    enabled: Boolean(selected?.id),
  });
  const nudge = useQuery({
    queryKey: ['nudge-policy', params.reminderId],
    queryFn: () => getNudgePolicy(params.reminderId),
    enabled: Boolean(params.reminderId) && detail.data?.lifecycle === 'ACTIVE',
  });
  const history = useQuery({
    queryKey: ['reminder-events', params.reminderId],
    queryFn: () => listReminderEvents(params.reminderId, 8),
    enabled: Boolean(params.reminderId),
  });

  async function refreshReminderState() {
    const refreshed = await detail.refetch();
    if (refreshed.data) await scheduleReminderNotifications(refreshed.data);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['reminder-occurrences'] }),
      queryClient.invalidateQueries({ queryKey: ['reminder-events', params.reminderId] }),
      queryClient.invalidateQueries({ queryKey: ['occurrence-explanation'] }),
    ]);
  }

  const snoozeMutation = useMutation({
    mutationFn: async (minutes: number) => {
      if (!selected) throw new Error('Occurrence unavailable.');
      await snoozeOccurrence({
        occurrenceId: selected.id,
        idempotencyKey: createIdempotencyKey('snooze'),
        until: new Date(Date.now() + minutes * 60_000).toISOString(),
        expectedScheduleRevision: selected.scheduleRevision,
        expectedEffectiveScheduledAt: selected.effectiveScheduledAt,
      });
      return minutes;
    },
    onSuccess: async (minutes) => {
      await refreshReminderState();
      showToast({
        title: 'Reminder snoozed',
        message: `This occurrence moved by ${formatDuration(minutes)}.`,
        tone: 'success',
      });
    },
    onError: (error) => actionError(showToast, 'Couldn’t snooze this reminder', error),
  });

  const terminalMutation = useMutation({
    mutationFn: async (action: TerminalAction) => {
      if (!selected) throw new Error('Occurrence unavailable.');
      const input = {
        occurrenceId: selected.id,
        expectedScheduleRevision: selected.scheduleRevision,
        expectedEffectiveScheduledAt: selected.effectiveScheduledAt,
        idempotencyKey: createIdempotencyKey(action),
      };
      return action === 'complete' ? completeOccurrence(input) : skipOccurrence(input);
    },
    onSuccess: async (_, action) => {
      await refreshReminderState();
      showToast({
        title: action === 'complete' ? 'Reminder completed' : 'Occurrence skipped',
        message:
          action === 'complete'
            ? 'It is now recorded in your completed reminders.'
            : 'The rest of the recurring schedule is unchanged.',
        tone: 'success',
      });
    },
    onError: (error, action) =>
      actionError(
        showToast,
        action === 'complete' ? 'Couldn’t complete this reminder' : 'Couldn’t skip this reminder',
        error,
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!detail.data) throw new Error('Reminder unavailable.');
      const snapshot = detail.data;
      await deleteReminder({
        reminderId: snapshot.id,
        expectedRevision: snapshot.revision,
        idempotencyKey: createIdempotencyKey('delete'),
      });
      await cancelReminderNotifications(snapshot);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reminder-occurrences'] });
      showToast({
        title: 'Reminder deleted',
        message: 'Its pending device alerts were cancelled.',
        tone: 'success',
      });
      router.replace('/home');
    },
    onError: (error) => actionError(showToast, 'Couldn’t delete this reminder', error),
  });

  const nudgeMutation = useMutation({
    mutationFn: async (input: { enabled: boolean; intervalMinutes?: number }) => {
      if (!detail.data) throw new Error('Reminder unavailable.');
      return updateNudgePolicy({
        reminderId: detail.data.id,
        expectedReminderRevision: detail.data.revision,
        enabled: input.enabled,
        ...(input.intervalMinutes ? { intervalMinutes: input.intervalMinutes } : {}),
        idempotencyKey: createIdempotencyKey('nudge'),
      });
    },
    onSuccess: async () => {
      await nudge.refetch();
      await refreshReminderState();
      showToast({
        title: 'Follow-up updated',
        message: 'The nudge policy now applies to this schedule revision.',
        tone: 'success',
      });
    },
    onError: (error) => actionError(showToast, 'Couldn’t update the follow-up', error),
  });

  if (status !== 'authenticated') return <Redirect href="/" />;

  function confirmDelete() {
    Alert.alert(
      'Delete this reminder?',
      'The reminder will be cancelled now and permanently purged after the retention period.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ],
    );
  }

  return (
    <>
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
        {detail.isPending ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#2764E7" />
          </View>
        ) : detail.isError || !detail.data || !selected ? (
          <View className="flex-1">
            <OneUIHeader onBack={() => router.back()} title="Reminder" />
            <View className="px-5">
              <ErrorCard
                message={detail.error ? formErrorMessage(detail.error) : 'This reminder has no occurrences.'}
                onRetry={() => void detail.refetch()}
              />
            </View>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerClassName="pb-12"
            showsVerticalScrollIndicator={false}
          >
            <View className="w-full max-w-[680px] self-center">
              <OneUIHeader
                action={
                  <Pressable
                    accessibilityLabel="Edit reminder text"
                    accessibilityRole="button"
                    className="size-12 items-center justify-center rounded-full active:bg-secondary-fill"
                    onPress={() => setEditContentOpen(true)}
                  >
                    <SymbolIcon name="edit" size={23} />
                  </Pressable>
                }
                onBack={() => router.back()}
                title="Reminder"
              />
              <View className="px-5">
                <ReminderHero
                  detail={detail.data}
                  locale={state.preferences.locale}
                  now={now}
                  occurrence={selected}
                  timeFormat={state.preferences.timeFormat}
                />

                {selected.lifecycle === 'SCHEDULED' ? (
                  <ActionGrid
                    busy={snoozeMutation.isPending || terminalMutation.isPending}
                    canComplete={new Date(selected.effectiveScheduledAt).getTime() <= now}
                    recurring={detail.data.schedule.type !== 'ONE_TIME'}
                    onComplete={() => terminalMutation.mutate('complete')}
                    onReschedule={() => setRescheduleOpen(true)}
                    onSkip={() => terminalMutation.mutate('skip')}
                    onSnooze={() => snoozeMutation.mutate(10)}
                  />
                ) : null}

                <SectionTitle title="Details" />
                <View className="overflow-hidden rounded-[24px] bg-paper">
                  <DetailRow icon="repeat" label="Repeats" value={recurrenceLabel(detail.data)} />
                  <Divider />
                  <DetailRow
                    icon="clock"
                    label="Local schedule"
                    value={`${selected.localDate} · ${selected.localTime}`}
                  />
                  <Divider />
                  <DetailRow icon="calendar" label="Timezone" value={detail.data.schedule.timezone} />
                </View>

                {explanation.data ? (
                  <>
                    <SectionTitle title="Why now?" />
                    <View className="rounded-[24px] bg-intelligence-soft p-5">
                      <View className="flex-row items-start">
                        <View className="size-10 items-center justify-center rounded-full bg-white">
                          <SymbolIcon className="text-intelligence" name="sparkle" size={20} />
                        </View>
                        <View className="ml-3 flex-1">
                          <Text className="text-[16px] font-semibold text-ink">
                            Schedule explanation
                          </Text>
                          <Text className="mt-1.5 text-[14px] leading-6 text-muted-ink">
                            {explanation.data.reason}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </>
                ) : null}

                {detail.data.lifecycle === 'ACTIVE' ? (
                  <>
                    <SectionTitle title="Follow-up nudge" />
                    <View className="rounded-[24px] bg-paper p-4">
                      <View className="min-h-14 flex-row items-center">
                        <View className="flex-1 pr-4">
                          <Text className="text-[16px] font-semibold text-ink">Nudge me again</Text>
                          <Text className="mt-1 text-[13px] leading-5 text-muted-ink">
                            One bounded follow-up if this reminder remains open.
                          </Text>
                        </View>
                        <Switch
                          accessibilityLabel="Enable follow-up nudge"
                          disabled={nudgeMutation.isPending || nudge.isPending}
                          onValueChange={(enabled) =>
                            nudgeMutation.mutate({
                              enabled,
                              ...(enabled ? { intervalMinutes: nudge.data?.intervalMinutes ?? 30 } : {}),
                            })
                          }
                          thumbColor="#FFFFFF"
                          trackColor={{ false: '#DADCE2', true: '#2764E7' }}
                          value={nudge.data?.enabled ?? false}
                        />
                      </View>
                      {nudge.data?.enabled ? (
                        <View className="mt-3 flex-row gap-2 border-t border-taupe/70 pt-4">
                          {[15, 30, 60].map((minutes) => (
                            <Pressable
                              key={minutes}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: nudge.data?.intervalMinutes === minutes }}
                              className={cn(
                                'min-h-11 flex-1 items-center justify-center rounded-full',
                                nudge.data?.intervalMinutes === minutes
                                  ? 'bg-intelligence'
                                  : 'bg-secondary-fill',
                              )}
                              disabled={nudgeMutation.isPending}
                              onPress={() =>
                                nudgeMutation.mutate({ enabled: true, intervalMinutes: minutes })
                              }
                            >
                              <Text
                                className={cn(
                                  'text-[13px] font-semibold',
                                  nudge.data?.intervalMinutes === minutes ? 'text-white' : 'text-ink',
                                )}
                              >
                                {minutes === 60 ? '1 hour' : `${minutes} min`}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </>
                ) : null}

                {history.data?.items.length ? (
                  <>
                    <SectionTitle title="Activity" />
                    <View className="overflow-hidden rounded-[24px] bg-paper">
                      {history.data.items.map((event, index) => (
                        <View key={event.id}>
                          {index > 0 ? <Divider inset /> : null}
                          <View className="min-h-[66px] flex-row items-center px-4 py-3">
                            <View className="size-9 items-center justify-center rounded-full bg-secondary-fill">
                              <SymbolIcon name="history" size={18} />
                            </View>
                            <View className="ml-3 flex-1">
                              <Text className="text-[14px] font-semibold text-ink">
                                {eventLabel(event.type)}
                              </Text>
                              <Text className="mt-1 text-[12px] text-muted-ink">
                                {formatHistoryTime(event.createdAt, state.preferences.locale)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  className="mt-8 min-h-14 flex-row items-center justify-center rounded-[20px] bg-urgent-soft active:opacity-75"
                  disabled={deleteMutation.isPending}
                  onPress={confirmDelete}
                >
                  {deleteMutation.isPending ? (
                    <ActivityIndicator color="#D63B32" />
                  ) : (
                    <>
                      <SymbolIcon className="text-urgent" name="delete" size={22} />
                      <Text className="ml-2 text-[15px] font-semibold text-urgent">Delete reminder</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>

      {detail.data && selected && rescheduleOpen ? (
        <RescheduleModal
          detail={detail.data}
          occurrence={selected}
          onClose={() => setRescheduleOpen(false)}
          onSaved={async () => {
            setRescheduleOpen(false);
            await refreshReminderState();
          }}
          showToast={showToast}
        />
      ) : null}

      {detail.data && editContentOpen ? (
        <EditContentModal
          detail={detail.data}
          onClose={() => setEditContentOpen(false)}
          onSaved={async () => {
            setEditContentOpen(false);
            await refreshReminderState();
          }}
          showToast={showToast}
        />
      ) : null}
    </>
  );
}

function ReminderHero({
  detail,
  occurrence,
  locale,
  now,
  timeFormat,
}: {
  detail: ReminderDetail;
  occurrence: ReminderDetail['occurrences'][number];
  locale: string;
  now: number;
  timeFormat: '12-hour' | '24-hour';
}) {
  const terminal = occurrence.lifecycle === 'COMPLETED' || occurrence.lifecycle === 'SKIPPED';
  return (
    <View className="rounded-[28px] bg-paper p-5">
      <View className="flex-row items-start">
        <View
          className={cn(
            'size-14 items-center justify-center rounded-[20px]',
            terminal ? 'bg-completed-soft' : 'bg-intelligence-soft',
          )}
        >
          <SymbolIcon
            className={terminal ? 'text-completed' : 'text-intelligence'}
            name={terminal ? 'check' : 'notification'}
            size={24}
          />
        </View>
        <View className="ml-4 flex-1">
          <Text className="text-[12px] font-bold tracking-[1.1px] text-subtle-ink">
            {statusLabel(occurrence, now)}
          </Text>
          <Text className="mt-2 text-[27px] font-bold leading-[33px] tracking-[-0.6px] text-ink">
            {detail.title}
          </Text>
          {detail.contextNote ? (
            <Text className="mt-2 text-[14px] leading-6 text-muted-ink">{detail.contextNote}</Text>
          ) : null}
        </View>
      </View>
      <View className="mt-5 border-t border-taupe/70 pt-4">
        <Text className="text-[16px] font-semibold text-ink">
          {formatOccurrence(occurrence.effectiveScheduledAt, detail.schedule.timezone, locale, timeFormat)}
        </Text>
        <Text className="mt-1 text-[12px] text-muted-ink">{detail.schedule.timezone}</Text>
      </View>
    </View>
  );
}

function ActionGrid({
  busy,
  canComplete,
  recurring,
  onComplete,
  onSnooze,
  onReschedule,
  onSkip,
}: {
  busy: boolean;
  canComplete: boolean;
  recurring: boolean;
  onComplete: () => void;
  onSnooze: () => void;
  onReschedule: () => void;
  onSkip: () => void;
}) {
  return (
    <View className="mt-4 flex-row flex-wrap gap-3">
      {canComplete ? (
        <ActionButton icon="check" label="Complete" primary disabled={busy} onPress={onComplete} />
      ) : null}
      <ActionButton icon="clock" label="Snooze 10m" disabled={busy} onPress={onSnooze} />
      <ActionButton icon="calendar" label="Reschedule" disabled={busy} onPress={onReschedule} />
      {recurring ? <ActionButton icon="chevron" label="Skip" disabled={busy} onPress={onSkip} /> : null}
    </View>
  );
}

function ActionButton({
  icon,
  label,
  primary = false,
  disabled,
  onPress,
}: {
  icon: SymbolName;
  label: string;
  primary?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(
        'min-h-[56px] min-w-[46%] flex-1 flex-row items-center justify-center rounded-[20px] px-3',
        primary ? 'bg-intelligence' : 'bg-paper',
        disabled && 'opacity-50',
      )}
      disabled={disabled}
      onPress={onPress}
    >
      <SymbolIcon className={primary ? 'text-white' : 'text-ink'} name={icon} size={19} />
      <Text className={cn('ml-2 text-[14px] font-semibold', primary ? 'text-white' : 'text-ink')}>
        {label}
      </Text>
    </Pressable>
  );
}

function EditContentModal({
  detail,
  onClose,
  onSaved,
  showToast,
}: {
  detail: ReminderDetail;
  onClose: () => void;
  onSaved: () => Promise<void>;
  showToast: ReturnType<typeof useToast>['showToast'];
}) {
  const [title, setTitle] = useState(detail.title);
  const [contextNote, setContextNote] = useState(detail.contextNote ?? '');
  const mutation = useMutation({
    mutationFn: () =>
      updateReminderContent({
        reminderId: detail.id,
        expectedRevision: detail.revision,
        title: title.trim(),
        contextNote: contextNote.trim() || null,
        idempotencyKey: createIdempotencyKey('content'),
      }),
    onSuccess: async () => {
      await onSaved();
      showToast({
        title: 'Reminder updated',
        message: 'The new text is saved and device alerts were reconciled.',
        tone: 'success',
      });
    },
    onError: (error) => actionError(showToast, 'Couldn’t update the reminder', error),
  });
  const valid = title.trim().length > 0 && title.trim().length <= 120;

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <SafeAreaView className="flex-1 bg-canvas">
        <ScrollView contentContainerClassName="px-5 pb-10" keyboardShouldPersistTaps="handled">
          <OneUIHeader onBack={onClose} subtitle="Update the text shown in lists and notifications." title="Edit reminder" />
          <View className="gap-4">
            <TextField label="Title" maxLength={120} onChangeText={setTitle} value={title} />
            <TextField
              label="Note · optional"
              maxLength={2000}
              multiline
              onChangeText={setContextNote}
              value={contextNote}
            />
            <Button
              disabled={!valid}
              label="Save changes"
              loading={mutation.isPending}
              onPress={() => mutation.mutate()}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
  const [scope, setScope] = useState<EditScope>('THIS_OCCURRENCE');
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
            : 'This and future occurrences use the new schedule.',
        tone: 'success',
      });
    },
    onError: (error) => actionError(showToast, 'Couldn’t update the schedule', error),
  });

  function onPickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setPickerMode(null);
    if (event.type !== 'set' || !selected) return;
    const next = new Date(dateTime);
    if (pickerMode === 'date') {
      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    } else {
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    }
    setDateTime(next);
    key.current = createIdempotencyKey('reschedule');
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <SafeAreaView className="flex-1 bg-canvas">
        <ScrollView contentContainerClassName="px-5 pb-10">
          <OneUIHeader
            onBack={onClose}
            subtitle={`The schedule timezone stays ${detail.schedule.timezone}.`}
            title="Reschedule"
          />

          {recurring ? (
            <View className="gap-2">
              <SectionTitle title="Apply to" />
              <ScopeChoice
                description="Keep later occurrences where they are"
                label="This occurrence only"
                onPress={() => setScope('THIS_OCCURRENCE')}
                selected={scope === 'THIS_OCCURRENCE'}
              />
              <ScopeChoice
                description="Create a new revision for this and future occurrences"
                label="This and future"
                onPress={() => setScope('THIS_AND_FUTURE')}
                selected={scope === 'THIS_AND_FUTURE'}
              />
            </View>
          ) : null}

          <View className="mt-6 overflow-hidden rounded-[24px] bg-paper">
            <DateRow label="Date" onPress={() => setPickerMode('date')} value={formatLocalDate(dateTime)} />
            <Divider />
            <DateRow label="Time" onPress={() => setPickerMode('time')} value={formatLocalTime(dateTime)} />
          </View>

          {pickerMode ? (
            <View className="mt-4 rounded-[24px] bg-paper p-3">
              <DateTimePicker
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={pickerMode === 'date' ? new Date() : undefined}
                mode={pickerMode}
                onChange={onPickerChange}
                value={dateTime}
              />
              {Platform.OS === 'ios' ? (
                <Pressable
                  className="min-h-11 items-center justify-center rounded-xl bg-secondary-fill"
                  onPress={() => setPickerMode(null)}
                >
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

function ScopeChoice({
  label,
  description,
  selected,
  onPress,
}: {
  label: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={cn(
        'min-h-[76px] flex-row items-center rounded-[22px] border-2 bg-paper p-4',
        selected ? 'border-intelligence' : 'border-transparent',
      )}
      onPress={onPress}
    >
      <View
        className={cn(
          'size-6 items-center justify-center rounded-full border-2',
          selected ? 'border-intelligence' : 'border-taupe',
        )}
      >
        {selected ? <View className="size-3 rounded-full bg-intelligence" /> : null}
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-[15px] font-semibold text-ink">{label}</Text>
        <Text className="mt-1 text-[12px] leading-4 text-muted-ink">{description}</Text>
      </View>
    </Pressable>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text className="mb-3 ml-1 mt-7 text-[20px] font-bold text-ink">{title}</Text>;
}

function DetailRow({ icon, label, value }: { icon: SymbolName; label: string; value: string }) {
  return (
    <View className="min-h-[68px] flex-row items-center px-4 py-3">
      <View className="size-9 items-center justify-center rounded-full bg-secondary-fill">
        <SymbolIcon name={icon} size={18} />
      </View>
      <Text className="ml-3 flex-1 text-[15px] font-medium text-ink">{label}</Text>
      <Text className="ml-4 max-w-[48%] text-right text-[13px] text-muted-ink">{value}</Text>
    </View>
  );
}

function DateRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-[62px] flex-row items-center px-4 active:bg-canvas"
      onPress={onPress}
    >
      <Text className="flex-1 text-[16px] font-medium text-ink">{label}</Text>
      <Text className="text-[15px] text-muted-ink">{value}</Text>
      <SymbolIcon className="ml-2 text-subtle-ink" name="chevron" size={24} />
    </Pressable>
  );
}

function Divider({ inset = false }: { inset?: boolean }) {
  return <View className={cn('h-px bg-taupe/70', inset ? 'ml-16' : 'ml-4')} />;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="rounded-[24px] bg-paper p-5">
      <Text className="text-[19px] font-semibold text-ink">Reminder unavailable</Text>
      <Text className="mt-2 text-[14px] leading-5 text-muted-ink">{message}</Text>
      <View className="mt-5">
        <Button label="Try again" onPress={onRetry} variant="secondary" />
      </View>
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
      return `Selected weekdays · ${detail.schedule.weekdays.map(weekdayName).join(', ')}`;
  }
}

function statusLabel(occurrence: ReminderDetail['occurrences'][number], now: number) {
  if (occurrence.lifecycle === 'SCHEDULED') {
    return new Date(occurrence.effectiveScheduledAt).getTime() <= now ? 'DUE NOW' : 'SCHEDULED';
  }
  return occurrence.lifecycle;
}

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    REMINDER_CREATED: 'Reminder created',
    REMINDER_UPDATED: 'Reminder text updated',
    SCHEDULE_REVISED: 'Schedule revised',
    OCCURRENCE_SNOOZED: 'Occurrence snoozed',
    OCCURRENCE_COMPLETED: 'Occurrence completed',
    OCCURRENCE_SKIPPED: 'Occurrence skipped',
    NUDGE_POLICY_UPDATED: 'Follow-up changed',
    NOTIFICATION_SCHEDULED: 'Device alert scheduled',
    NOTIFICATION_SCHEDULING_FAILED: 'Device alert failed',
    NOTIFICATION_OPENED: 'Notification opened',
  };
  return labels[type] ?? type.toLowerCase().replaceAll('_', ' ');
}

function formatOccurrence(
  instant: string,
  timezone: string,
  locale: string,
  format: '12-hour' | '24-hour',
) {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: format === '12-hour',
    timeZone: timezone,
  }).format(new Date(instant));
}

function formatHistoryTime(instant: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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

function weekdayName(day: number) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day] ?? String(day);
}

function actionError(
  showToast: ReturnType<typeof useToast>['showToast'],
  title: string,
  error: unknown,
) {
  showToast({ title, message: formErrorMessage(error), tone: 'error' });
}
