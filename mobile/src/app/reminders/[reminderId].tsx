import { useMemo, useRef, useState } from 'react';
import { Slider as NativeSlider } from '@expo/ui/community/slider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthProvider';
import { formErrorMessage } from '../../auth/form-error';
import {
  ContextTriggerFields,
  type ContextTriggerDraft,
} from '../../components/reminders/ContextTriggerFields';
import { AlertDialog } from '../../components/ui/AlertDialog';
import { AppleSwitch } from '../../components/ui/AppleSwitch';
import { AuthIcon, type AuthIconName } from '../../components/ui/AuthIcon';
import { Button } from '../../components/ui/Button';
import { DateTimePickerSheet } from '../../components/ui/DateTimePickerSheet';
import { OneUIHeader } from '../../components/ui/OneUIHeader';
import { DetailSkeleton } from '../../components/ui/Skeleton';
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
  createContextTrigger,
  createIdempotencyKey,
  createReminderWorkflow,
  deleteReminder,
  editReminderSchedule,
  getNudgePolicy,
  getOccurrenceExplanation,
  getReminder,
  listReminderEvents,
  listContextTriggers,
  listReminderWorkflows,
  replaceReminderChecklist,
  skipOccurrence,
  snoozeOccurrence,
  updateContextTriggerLifecycle,
  updateNudgePolicy,
  updateReminderContent,
  updateReminderWorkflowLifecycle,
  toggleOccurrenceChecklistItem,
} from '../../reminders/reminder.api';
import { reminderCachePolicy, reminderQueryKeys } from '../../reminders/reminder.queries';
import type { ContextTrigger, ReminderDetail, ReminderWorkflow } from '../../reminders/reminder.schemas';
import { useAppTheme } from '../../theme/theme-context';
import {
  currentLocationForTrigger,
  refreshContextTriggerRuntime,
  requestLocationTriggerPermissions,
} from '../../platform/device-triggers/context-trigger-runtime';

type EditScope = 'THIS_OCCURRENCE' | 'THIS_AND_FUTURE';
type PickerMode = 'date' | 'time' | null;
type TerminalAction = 'complete' | 'skip';
type DetailTab = 'overview' | 'automations' | 'activity';

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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');

  const detail = useQuery({
    queryKey: reminderQueryKeys.detail(params.reminderId),
    queryFn: () => getReminder(params.reminderId),
    enabled: status === 'authenticated' && Boolean(params.reminderId),
    ...reminderCachePolicy,
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
    queryKey: reminderQueryKeys.explanation(selected?.id ?? 'unselected'),
    queryFn: () => getOccurrenceExplanation(selected!.id),
    enabled: Boolean(selected?.id),
    ...reminderCachePolicy,
  });
  const nudge = useQuery({
    queryKey: reminderQueryKeys.nudgePolicy(params.reminderId),
    queryFn: () => getNudgePolicy(params.reminderId),
    enabled: Boolean(params.reminderId) && detail.data?.lifecycle === 'ACTIVE',
    ...reminderCachePolicy,
  });
  const history = useQuery({
    queryKey: reminderQueryKeys.events(params.reminderId),
    queryFn: () => listReminderEvents(params.reminderId, 8),
    enabled: Boolean(params.reminderId),
    ...reminderCachePolicy,
  });
  const workflows = useQuery({
    queryKey: reminderQueryKeys.workflows(params.reminderId),
    queryFn: () => listReminderWorkflows(params.reminderId),
    enabled: status === 'authenticated' && Boolean(params.reminderId),
    ...reminderCachePolicy,
  });
  const triggers = useQuery({
    queryKey: reminderQueryKeys.contextTriggers(params.reminderId),
    queryFn: () => listContextTriggers(params.reminderId),
    enabled: status === 'authenticated' && Boolean(params.reminderId),
    ...reminderCachePolicy,
  });
  const workflowLifecycleMutation = useMutation({
    mutationFn: (workflow: ReminderWorkflow) =>
      updateReminderWorkflowLifecycle({
        workflowId: workflow.id,
        expectedRevision: workflow.revision,
        lifecycle: workflow.lifecycle === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
        idempotencyKey: createIdempotencyKey('workflow-lifecycle'),
      }),
    onSuccess: async (updated) => {
      await workflows.refetch();
      showToast({
        title: updated.lifecycle === 'ACTIVE' ? 'Workflow resumed' : 'Workflow paused',
        message:
          updated.lifecycle === 'ACTIVE'
            ? 'New completions can start this chain.'
            : 'Active runs continue, but new chains will not start.',
        tone: 'success',
      });
    },
    onError: (error) => actionError(showToast, 'Couldn’t update the workflow', error),
  });
  const triggerLifecycleMutation = useMutation({
    mutationFn: (trigger: ContextTrigger) =>
      updateContextTriggerLifecycle({
        triggerId: trigger.id,
        expectedRevision: trigger.revision,
        lifecycle: trigger.lifecycle === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
        idempotencyKey: createIdempotencyKey('trigger-lifecycle'),
      }),
    onSuccess: async (updated) => {
      const results = await Promise.allSettled([triggers.refetch(), refreshContextTriggerRuntime()]);
      showToast({
        title: updated.lifecycle === 'ACTIVE' ? 'Trigger resumed' : 'Trigger paused',
        message:
          results.some((result) => result.status === 'rejected')
            ? 'Saved. Device monitoring will reconcile when the app returns to foreground.'
            : updated.lifecycle === 'ACTIVE'
              ? 'Device monitoring is active.'
              : 'Device monitoring has been updated.',
        tone: 'success',
      });
    },
    onError: (error) => actionError(showToast, 'Couldn’t update the trigger', error),
  });

  async function refreshReminderState() {
    const refreshed = await detail.refetch();
    if (refreshed.data) await scheduleReminderNotifications(refreshed.data);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: reminderQueryKeys.occurrenceLists() }),
      queryClient.invalidateQueries({ queryKey: reminderQueryKeys.events(params.reminderId) }),
      queryClient.invalidateQueries({ queryKey: reminderQueryKeys.explanations() }),
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
    onSuccess: async (result, action) => {
      await refreshReminderState();
      if (action === 'complete' && result.activatedReminders?.length) {
        const activated = await Promise.allSettled(
          result.activatedReminders.map(async ({ reminderId }) => {
            const reminder = await getReminder(reminderId);
            return scheduleReminderNotifications(reminder);
          }),
        );
        await queryClient.invalidateQueries({ queryKey: reminderQueryKeys.occurrenceLists() });
        if (activated.some((item) => item.status === 'rejected')) {
          showToast({
            title: 'Next reminder created',
            message: 'Its device alert will be reconciled the next time the app syncs.',
            tone: 'info',
          });
        }
      }
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
      await queryClient.invalidateQueries({ queryKey: reminderQueryKeys.occurrenceLists() });
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

  const checklistToggleMutation = useMutation({
    mutationFn: async (item: ReminderDetail['occurrences'][number]['checklist'][number]) => {
      if (!selected) throw new Error('Occurrence unavailable.');
      return toggleOccurrenceChecklistItem({
        occurrenceId: selected.id,
        itemId: item.id,
        expectedRevision: item.revision,
        checked: !item.checked,
        idempotencyKey: createIdempotencyKey('checklist-item'),
      });
    },
    onSuccess: refreshReminderState,
    onError: (error) => actionError(showToast, 'Couldn’t update the checklist', error),
  });

  if (status !== 'authenticated') return <Redirect href="/" />;

  return (
    <>
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
        {detail.isPending ? (
          <DetailSkeleton />
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
              <DetailTopBar
                onBack={() => router.back()}
                onEdit={() => setEditContentOpen(true)}
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

                <DetailTabs value={detailTab} onChange={setDetailTab} />

                {detailTab === 'overview' ? (
                  <>
                <SectionTitle title="Checklist" />
                <OccurrenceChecklist
                  busy={checklistToggleMutation.isPending}
                  editable={selected.lifecycle === 'SCHEDULED'}
                  items={selected.checklist}
                  onEdit={() => setChecklistOpen(true)}
                  onToggle={(item) => checklistToggleMutation.mutate(item)}
                />

                <SectionTitle title="Occurrences" />
                <OccurrenceTimeline
                  locale={state.preferences.locale}
                  now={now}
                  occurrences={detail.data.occurrences}
                  selectedId={selected.id}
                  timeFormat={state.preferences.timeFormat}
                  timezone={detail.data.schedule.timezone}
                  onSelect={(occurrenceId) => router.setParams({ occurrenceId })}
                />

                <SectionTitle title="Details" />
                <View className="border-y border-taupe">
                  <DetailRow icon="repeat" label="Repeats" value={recurrenceLabel(detail.data)} />
                  <Divider />
                  <DetailRow
                    icon="clock"
                    label="Local schedule"
                    value={formatLocalSchedule(
                      selected.localDate,
                      selected.localTime,
                      state.preferences.locale,
                      state.preferences.timeFormat,
                    )}
                  />
                  <Divider />
                  <DetailRow icon="calendar" label="Timezone" value={detail.data.schedule.timezone} />
                </View>
                  </>
                ) : null}

                {detailTab === 'activity' && explanation.data ? (
                  <>
                    <SectionTitle title="Why now?" />
                    <View className="border-y border-taupe py-5">
                      <View className="flex-row items-start">
                        <View className="size-10 items-center justify-center rounded-full bg-intelligence-soft">
                          <SymbolIcon className="text-accent" name="sparkle" size={20} />
                        </View>
                        <View className="ml-3 flex-1">
                          <Text className="text-[16px] font-inter-semibold text-foreground">
                            Schedule explanation
                          </Text>
                          <Text className="font-inter mt-1.5 text-[14px] leading-6 text-muted-foreground">
                            {explanation.data.reason}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </>
                ) : null}

                {detailTab === 'automations' && detail.data.lifecycle === 'ACTIVE' ? (
                  <>
                    <SectionTitle title="Follow-up nudge" />
                    <NudgeControl
                      key={`nudge-${nudge.data?.enabled}-${nudge.data?.intervalMinutes}`}
                      disabled={nudgeMutation.isPending || nudge.isPending}
                      enabled={nudge.data?.enabled ?? false}
                      intervalMinutes={nudge.data?.intervalMinutes ?? 30}
                      onSave={(intervalMinutes) =>
                        nudgeMutation.mutate({ enabled: true, intervalMinutes })
                      }
                      onToggle={(enabled) =>
                        nudgeMutation.mutate({
                          enabled,
                          ...(enabled
                            ? { intervalMinutes: nudge.data?.intervalMinutes ?? 30 }
                            : {}),
                        })
                      }
                    />
                  </>
                ) : null}

                {detailTab === 'automations' && detail.data.lifecycle === 'ACTIVE' ? (
                  <>
                    <SectionTitle title="Automations" />
                    <AutomationSummary
                      triggers={triggers.data ?? []}
                      workflows={workflows.data ?? []}
                      busyTriggerId={triggerLifecycleMutation.isPending ? triggerLifecycleMutation.variables?.id : undefined}
                      busyWorkflowId={workflowLifecycleMutation.isPending ? workflowLifecycleMutation.variables?.id : undefined}
                      onAddTrigger={() => setTriggerOpen(true)}
                      onAddWorkflow={() => setWorkflowOpen(true)}
                      onToggleTrigger={(trigger) => triggerLifecycleMutation.mutate(trigger)}
                      onToggleWorkflow={(workflow) => workflowLifecycleMutation.mutate(workflow)}
                    />
                  </>
                ) : null}

                {detailTab === 'activity' && history.data?.items.length ? (
                  <>
                    <SectionTitle title="Activity" />
                    <View className="border-y border-taupe">
                      {history.data.items.map((event, index) => (
                        <View key={event.id}>
                          {index > 0 ? <Divider inset /> : null}
                          <View className="min-h-[66px] flex-row items-center px-4 py-3">
                            <View className="size-9 items-center justify-center rounded-full bg-secondary-fill">
                              <SymbolIcon name="history" size={18} />
                            </View>
                            <View className="ml-3 flex-1">
                              <Text className="text-[14px] font-inter-semibold text-foreground">
                                {eventLabel(event.type)}
                              </Text>
                              <Text className="font-inter mt-1 text-[12px] text-muted-foreground">
                                {formatHistoryTime(event.createdAt, state.preferences.locale)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}

                {detailTab === 'activity' && !history.isPending && !history.data?.items.length ? (
                  <View className="border-y border-taupe py-8">
                    <Text className="text-center font-inter-semibold text-[15px] text-foreground">No activity yet</Text>
                    <Text className="mt-1 text-center font-inter text-[13px] text-muted-foreground">
                      Changes and reminder actions will appear here.
                    </Text>
                  </View>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  className="mt-9 min-h-14 flex-row items-center justify-center border-t border-urgent/25 active:opacity-75"
                  disabled={deleteMutation.isPending}
                  onPress={() => setDeleteDialogOpen(true)}
                >
                  {deleteMutation.isPending ? (
                    <ActivityIndicator color="#B94A42" />
                  ) : (
                    <>
                      <AuthIcon color="#B94A42" name="trash" size={20} />
                      <Text className="ml-2 text-[15px] font-inter-semibold text-urgent">Delete reminder</Text>
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


      {detail.data && checklistOpen ? (
        <ChecklistEditorModal
          detail={detail.data}
          onClose={() => setChecklistOpen(false)}
          onSaved={async () => {
            setChecklistOpen(false);
            await refreshReminderState();
          }}
          showToast={showToast}
        />
      ) : null}

      {detail.data && workflowOpen ? (
        <WorkflowEditorModal
          detail={detail.data}
          onClose={() => setWorkflowOpen(false)}
          onSaved={async () => {
            setWorkflowOpen(false);
            await Promise.all([refreshReminderState(), workflows.refetch()]);
          }}
          showToast={showToast}
        />
      ) : null}

      {detail.data && triggerOpen ? (
        <ContextTriggerModal
          detail={detail.data}
          onClose={() => setTriggerOpen(false)}
          onSaved={async () => {
            setTriggerOpen(false);
            await Promise.all([refreshReminderState(), triggers.refetch(), refreshContextTriggerRuntime()]);
          }}
          showToast={showToast}
        />
      ) : null}

      <AlertDialog
        confirmLabel="Delete reminder"
        loading={deleteMutation.isPending}
        message="The reminder will be cancelled now and permanently purged after the retention period."
        title="Delete this reminder?"
        tone="destructive"
        visible={deleteDialogOpen}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
      />
    </>
  );
}

function OccurrenceChecklist({
  items,
  busy,
  editable,
  onToggle,
  onEdit,
}: {
  items: ReminderDetail['occurrences'][number]['checklist'];
  busy: boolean;
  editable: boolean;
  onToggle: (item: ReminderDetail['occurrences'][number]['checklist'][number]) => void;
  onEdit: () => void;
}) {
  return (
    <View className="border-y border-taupe">
      {items.length ? (
        items.map((item, index) => (
          <View key={item.id}>
            {index ? <Divider inset /> : null}
            <Pressable
              accessibilityLabel={item.text}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.checked, disabled: busy || !editable }}
              className="min-h-14 flex-row items-center py-3 active:bg-secondary-fill"
              disabled={busy || !editable}
              onPress={() => onToggle(item)}
            >
              <View
                className={cn(
                  'size-7 items-center justify-center rounded-[8px] border-2',
                  item.checked ? 'border-ink bg-ink' : 'border-taupe bg-white',
                )}
              >
                {item.checked ? <SymbolIcon className="text-white" name="check" size={16} /> : null}
              </View>
              <Text
                className={cn(
                  'ml-3 flex-1 font-inter text-[15px] leading-6 text-foreground',
                  item.checked && 'text-muted-foreground line-through',
                )}
              >
                {item.text}
              </Text>
            </Pressable>
          </View>
        ))
      ) : (
        <Text className="py-5 font-inter text-[14px] leading-6 text-muted-foreground">
          Add checkable steps for this reminder. Each recurring occurrence gets a fresh checklist.
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        className="min-h-12 items-start justify-center border-t border-taupe active:opacity-60"
        onPress={onEdit}
      >
        <Text className="font-inter-semibold text-[14px] text-intelligence">
          {items.length ? 'Edit checklist' : 'Add checklist'}
        </Text>
      </Pressable>
    </View>
  );
}

function AutomationSummary({
  workflows,
  triggers,
  busyWorkflowId,
  busyTriggerId,
  onAddWorkflow,
  onAddTrigger,
  onToggleWorkflow,
  onToggleTrigger,
}: {
  workflows: ReminderWorkflow[];
  triggers: ContextTrigger[];
  busyWorkflowId?: string;
  busyTriggerId?: string;
  onAddWorkflow: () => void;
  onAddTrigger: () => void;
  onToggleWorkflow: (workflow: ReminderWorkflow) => void;
  onToggleTrigger: (trigger: ContextTrigger) => void;
}) {
  return (
    <View className="border-y border-taupe">
      <View className="flex-row items-center justify-between py-3">
        <View className="flex-1 pr-4">
          <Text className="font-inter-semibold text-[15px] text-foreground">Completion chains</Text>
          <Text className="mt-1 font-inter text-[12px] leading-5 text-muted-foreground">
            Completing this reminder can start an ordered follow-up.
          </Text>
        </View>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onAddWorkflow}>
          <Text className="font-inter-semibold text-[14px] text-intelligence">Add</Text>
        </Pressable>
      </View>
      {workflows.length ? workflows.map((workflow) => (
        <View className="min-h-[66px] flex-row items-center border-t border-secondary-fill py-3" key={workflow.id}>
          <View className="flex-1 pr-4">
            <Text className="font-inter-medium text-[14px] text-foreground">{workflow.name}</Text>
            <Text className="mt-1 font-inter text-[12px] text-muted-foreground">
              {workflow.steps.length} {workflow.steps.length === 1 ? 'step' : 'steps'} · {workflow.lifecycle === 'ACTIVE' ? 'Active' : 'Paused'}
            </Text>
          </View>
          {busyWorkflowId === workflow.id ? (
            <ActivityIndicator />
          ) : (
            <AppleSwitch
              disabled={Boolean(busyWorkflowId) || workflow.lifecycle === 'CANCELLED'}
              label={`${workflow.lifecycle === 'ACTIVE' ? 'Pause' : 'Resume'} ${workflow.name}`}
              value={workflow.lifecycle === 'ACTIVE'}
              onValueChange={() => onToggleWorkflow(workflow)}
            />
          )}
        </View>
      )) : (
        <Text className="border-t border-secondary-fill py-4 font-inter text-[13px] leading-5 text-muted-foreground">
          No completion chain yet.
        </Text>
      )}

      <View className="mt-2 flex-row items-center justify-between border-t border-taupe py-3">
        <View className="flex-1 pr-4">
          <Text className="font-inter-semibold text-[15px] text-foreground">Place and Wi-Fi</Text>
          <Text className="mt-1 font-inter text-[12px] leading-5 text-muted-foreground">
            A match creates a new due copy. Wi-Fi checks run while active or returning to foreground.
          </Text>
        </View>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onAddTrigger}>
          <Text className="font-inter-semibold text-[14px] text-intelligence">Add</Text>
        </Pressable>
      </View>
      {triggers.length ? triggers.map((trigger) => (
        <View className="min-h-[66px] flex-row items-center border-t border-secondary-fill py-3" key={trigger.id}>
          <View className="flex-1 pr-4">
            <Text className="font-inter-medium text-[14px] text-foreground">{trigger.label}</Text>
            <Text className="mt-1 font-inter text-[12px] text-muted-foreground">
              {triggerTypeLabel(trigger.type)} · {trigger.lifecycle === 'ACTIVE' ? 'Active' : trigger.lifecycle === 'PAUSED' ? 'Paused' : 'Unavailable'}
            </Text>
            {trigger.location ? (
              <Text className="mt-1 font-inter text-[12px] text-muted-foreground">
                {trigger.location.radiusMeters} m radius · Location stored encrypted
              </Text>
            ) : trigger.network ? (
              <Text className="mt-1 font-inter text-[12px] text-muted-foreground">
                Exact network match · Name stored as a keyed fingerprint
              </Text>
            ) : null}
            {trigger.lastTriggeredAt ? (
              <Text className="mt-1 font-inter text-[12px] text-muted-foreground">
                Last matched {new Date(trigger.lastTriggeredAt).toLocaleString()}
              </Text>
            ) : null}
            {trigger.unavailableReason ? (
              <Text accessibilityRole="alert" className="mt-1 font-inter text-[12px] leading-5 text-urgent">
                {trigger.unavailableReason}
              </Text>
            ) : null}
          </View>
          {busyTriggerId === trigger.id ? (
            <ActivityIndicator />
          ) : (
            <AppleSwitch
              disabled={Boolean(busyTriggerId) || trigger.lifecycle === 'UNAVAILABLE'}
              label={`${trigger.lifecycle === 'ACTIVE' ? 'Pause' : 'Resume'} ${trigger.label}`}
              value={trigger.lifecycle === 'ACTIVE'}
              onValueChange={() => onToggleTrigger(trigger)}
            />
          )}
        </View>
      )) : (
        <Text className="border-t border-secondary-fill py-4 font-inter text-[13px] leading-5 text-muted-foreground">
          No place or Wi-Fi trigger yet.
        </Text>
      )}
    </View>
  );
}

function triggerTypeLabel(type: ContextTrigger['type']) {
  if (type === 'LOCATION_ARRIVE') return 'Arrive';
  if (type === 'LOCATION_LEAVE') return 'Leave';
  return 'Wi-Fi connect';
}

function ChecklistEditorModal({
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
  const [items, setItems] = useState<{ id?: string; text: string }[]>(
    detail.checklist.map((item) => ({ id: item.id, text: item.text })),
  );
  const mutation = useMutation({
    mutationFn: () =>
      replaceReminderChecklist({
        reminderId: detail.id,
        expectedReminderRevision: detail.revision,
        items: items.map((item) => ({ ...item, text: item.text.trim() })).filter((item) => item.text),
        idempotencyKey: createIdempotencyKey('checklist'),
      }),
    onSuccess: async () => {
      await onSaved();
      showToast({ title: 'Checklist saved', message: 'Future occurrences now use these checkable steps.', tone: 'success' });
    },
    onError: (error) => actionError(showToast, 'Couldn’t save the checklist', error),
  });
  const valid = items.length <= 50 && items.every((item) => item.text.trim().length <= 240);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <SafeAreaView className="flex-1 bg-canvas">
        <ScrollView contentContainerClassName="px-5 pb-10" keyboardShouldPersistTaps="handled">
          <OneUIHeader onBack={onClose} subtitle="These items reset for every recurring occurrence." title="Checklist" />
          <View className="gap-3">
            {items.map((item, index) => (
              <View className="flex-row items-end gap-2" key={item.id ?? `new-${index}`}>
                <View className="flex-1">
                  <TextField
                    label={`Item ${index + 1}`}
                    maxLength={240}
                    onChangeText={(text) =>
                      setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, text } : entry))
                    }
                    value={item.text}
                  />
                </View>
                <Pressable
                  accessibilityLabel={`Remove item ${index + 1}`}
                  accessibilityRole="button"
                  className="mb-1 size-12 items-center justify-center rounded-[14px] bg-urgent-soft"
                  onPress={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <AuthIcon color="#B94A42" name="trash" size={20} />
                </Pressable>
              </View>
            ))}
            {items.length < 50 ? (
              <Button label="Add item" onPress={() => setItems((current) => [...current, { text: '' }])} variant="secondary" />
            ) : null}
            <Button disabled={!valid} label="Save checklist" loading={mutation.isPending} onPress={() => mutation.mutate()} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

type WorkflowDraftStep = {
  title: string;
  contextNote: string;
  delayMinutes: string;
  requireChecklist: boolean;
};

function WorkflowEditorModal({
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
  const [name, setName] = useState(`After ${detail.title}`);
  const [steps, setSteps] = useState<WorkflowDraftStep[]>([
    { title: '', contextNote: '', delayMinutes: '0', requireChecklist: false },
  ]);
  const mutation = useMutation({
    mutationFn: () =>
      createReminderWorkflow({
        reminderId: detail.id,
        expectedReminderRevision: detail.revision,
        name: name.trim(),
        steps: steps.map((step) => ({
          title: step.title.trim(),
          ...(step.contextNote.trim() ? { contextNote: step.contextNote.trim() } : {}),
          delayMinutes: Number(step.delayMinutes) || 0,
          condition: step.requireChecklist ? 'ALL_CHECKLIST_COMPLETED' : 'PREVIOUS_COMPLETED',
        })),
        idempotencyKey: createIdempotencyKey('workflow'),
      }),
    onSuccess: async () => {
      await onSaved();
      showToast({ title: 'Workflow activated', message: 'Completing each step creates the next reminder.', tone: 'success' });
    },
    onError: (error) => actionError(showToast, 'Couldn’t create the workflow', error),
  });
  const valid =
    name.trim().length > 0 &&
    steps.length > 0 &&
    steps.every((step) => step.title.trim().length > 0 && Number(step.delayMinutes) >= 0 && Number(step.delayMinutes) <= 43_200);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <SafeAreaView className="flex-1 bg-canvas">
        <ScrollView contentContainerClassName="px-5 pb-10" keyboardShouldPersistTaps="handled">
          <OneUIHeader onBack={onClose} subtitle="A bounded sequence of up to 20 reminders." title="Chained reminders" />
          <View className="gap-5">
            <TextField label="Workflow name" maxLength={120} onChangeText={setName} value={name} />
            {steps.map((step, index) => (
              <View className="gap-3 border-t border-taupe pt-5" key={`step-${index}`}>
                <View className="flex-row items-center justify-between">
                  <Text className="font-inter-semibold text-[15px] text-foreground">Step {index + 1}</Text>
                  {steps.length > 1 ? (
                    <Pressable accessibilityRole="button" onPress={() => setSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                      <Text className="font-inter-semibold text-[13px] text-urgent">Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
                <TextField
                  label="Reminder title"
                  maxLength={120}
                  onChangeText={(title) => setSteps((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, title } : entry))}
                  value={step.title}
                />
                <TextField
                  label="Note · optional"
                  maxLength={2000}
                  multiline
                  onChangeText={(contextNote) => setSteps((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, contextNote } : entry))}
                  value={step.contextNote}
                />
                <TextField
                  keyboardType="number-pad"
                  label="Delay after completion · minutes"
                  onChangeText={(delayMinutes) => setSteps((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, delayMinutes } : entry))}
                  value={step.delayMinutes}
                />
                <View className="min-h-14 flex-row items-center justify-between">
                  <View className="mr-4 flex-1">
                    <Text className="font-inter-semibold text-[14px] text-foreground">Require every checklist item</Text>
                    <Text className="mt-1 font-inter text-[12px] leading-5 text-muted-foreground">Stop the chain if the previous occurrence is completed with unchecked items.</Text>
                  </View>
                  <AppleSwitch
                    label={`Require checklist for step ${index + 1}`}
                    value={step.requireChecklist}
                    onValueChange={(requireChecklist) => setSteps((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, requireChecklist } : entry))}
                  />
                </View>
              </View>
            ))}
            {steps.length < 20 ? (
              <Button label="Add another step" onPress={() => setSteps((current) => [...current, { title: '', contextNote: '', delayMinutes: '0', requireChecklist: false }])} variant="secondary" />
            ) : null}
            <Button disabled={!valid} label="Activate workflow" loading={mutation.isPending} onPress={() => mutation.mutate()} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ContextTriggerModal({
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
  const [draft, setDraft] = useState<ContextTriggerDraft>({
    id: 'new-context-trigger',
    type: 'LOCATION_ARRIVE',
    label: '',
    networkName: '',
    radius: '150',
  });
  const [capturingLocation, setCapturingLocation] = useState(false);
  const idempotencyKey = useRef(createIdempotencyKey('context-trigger'));

  function updateDraft(next: ContextTriggerDraft) {
    setDraft(next);
    idempotencyKey.current = createIdempotencyKey('context-trigger');
  }

  async function captureLocation() {
    setCapturingLocation(true);
    try {
      const permission = await requestLocationTriggerPermissions();
      if (!permission.foreground || !permission.background) {
        showToast({
          title: 'Location access is needed',
          message: 'Allow foreground and background location access to monitor arrival and departure.',
          tone: 'info',
        });
        return;
      }
      const location = await currentLocationForTrigger();
      updateDraft({ ...draft, ...location });
      showToast({ title: 'Location captured', message: 'The encrypted geofence center is ready.', tone: 'success' });
    } catch (error) {
      actionError(showToast, 'Couldn’t capture location', error);
    } finally {
      setCapturingLocation(false);
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const base = {
        reminderId: detail.id,
        expectedReminderRevision: detail.revision,
        type: draft.type,
        label: draft.label.normalize('NFC').trim().replace(/\s+/gu, ' '),
        cooldownSeconds: 300,
        idempotencyKey: idempotencyKey.current,
      } as const;
      if (draft.type === 'WIFI_CONNECT') {
        return createContextTrigger({ ...base, networkName: draft.networkName.normalize('NFC') });
      }
      if (draft.latitude === undefined || draft.longitude === undefined) {
        throw new Error('Capture the current location before activating this trigger.');
      }
      return createContextTrigger({
        ...base,
        latitude: draft.latitude,
        longitude: draft.longitude,
        radiusMeters: Number(draft.radius),
      });
    },
    onSuccess: async () => {
      idempotencyKey.current = createIdempotencyKey('context-trigger');
      await onSaved();
      showToast({
        title: 'Trigger activated',
        message: draft.type === 'WIFI_CONNECT' ? 'Wi-Fi will be checked while the app is active or resumes.' : 'The development build will monitor this geofence.',
        tone: 'success',
      });
    },
    onError: (error) => actionError(showToast, 'Couldn’t activate the trigger', error),
  });
  const valid =
    draft.label.trim().length > 0 &&
    (draft.type === 'WIFI_CONNECT'
      ? Array.from(draft.networkName).length > 0 && Array.from(draft.networkName).length <= 128
      : draft.latitude !== undefined &&
        draft.longitude !== undefined &&
        Number.isInteger(Number(draft.radius)) &&
        Number(draft.radius) >= 50 &&
        Number(draft.radius) <= 5_000);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <SafeAreaView className="flex-1 bg-canvas">
        <ScrollView contentContainerClassName="px-5 pb-10" keyboardShouldPersistTaps="handled">
          <OneUIHeader onBack={onClose} subtitle="Device context is permission- and platform-dependent." title="Context trigger" />
          <View className="gap-5">
            <ContextTriggerFields
              capturingLocation={capturingLocation}
              draft={draft}
              onCaptureLocation={() => void captureLocation()}
              onChange={updateDraft}
            />
            {draft.type === 'WIFI_CONNECT' ? (
              <Text className="font-inter text-[13px] leading-5 text-muted-foreground">
                Wi-Fi detection is best-effort while the app is active or returning to the foreground.
              </Text>
            ) : null}
            <Button disabled={!valid} label="Activate trigger" loading={mutation.isPending} onPress={() => mutation.mutate()} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function DetailTopBar({ onBack, onEdit }: { onBack: () => void; onEdit: () => void }) {
  return (
    <View className="h-16 flex-row items-center justify-between px-3">
      <Pressable
        accessibilityLabel="Go back"
        accessibilityRole="button"
        className="size-12 items-center justify-center rounded-full active:bg-secondary-fill"
        onPress={onBack}
      >
        <SymbolIcon name="back" size={34} />
      </Pressable>
      <Text className="font-inter-semibold text-[15px] text-muted-foreground">Reminder details</Text>
      <Pressable
        accessibilityLabel="Edit reminder text"
        accessibilityRole="button"
        className="size-12 items-center justify-center rounded-full active:bg-secondary-fill"
        onPress={onEdit}
      >
        <SymbolIcon name="edit" size={22} />
      </Pressable>
    </View>
  );
}

function DetailTabs({
  value,
  onChange,
}: {
  value: DetailTab;
  onChange: (value: DetailTab) => void;
}) {
  const items: { value: DetailTab; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'automations', label: 'Automations' },
    { value: 'activity', label: 'Activity' },
  ];

  return (
    <View className="mt-5 flex-row border-b border-taupe">
      {items.map((item) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: value === item.value }}
          className={cn(
            'min-h-12 flex-1 items-center justify-center border-b-2 px-1',
            value === item.value ? 'border-ink' : 'border-transparent',
          )}
          key={item.value}
          onPress={() => onChange(item.value)}
        >
          <Text
            className={cn(
              'font-inter-semibold text-[13px]',
              value === item.value ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
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
  const due =
    occurrence.lifecycle === 'SCHEDULED' &&
    new Date(occurrence.effectiveScheduledAt).getTime() <= now;
  const instant = new Date(occurrence.effectiveScheduledAt);
  return (
    <View className="border-b border-taupe pb-6 pt-2">
      <View className="flex-row items-center">
        <View className={cn('size-2.5 rounded-full', terminal ? 'bg-completed' : due ? 'bg-warning' : 'bg-scheduled')} />
        <Text className="ml-2 font-inter-semibold text-[12px] text-muted-foreground">
          {statusLabel(occurrence, now)} · OCCURRENCE {occurrence.sequence}
        </Text>
      </View>

      <View className="mt-5 flex-row items-end justify-between">
        <View>
          <Text className="font-display-bold text-[46px] leading-[50px] tabular-nums text-foreground">
            {formatOccurrenceTime(instant, detail.schedule.timezone, locale, timeFormat)}
          </Text>
          <Text className="mt-1 font-inter-medium text-[14px] text-muted-foreground">
            {formatOccurrenceDate(instant, detail.schedule.timezone, locale)}
          </Text>
        </View>
        <View className="size-12 items-center justify-center rounded-full bg-secondary-fill">
          <SymbolIcon
            className={terminal ? 'text-completed' : due ? 'text-warning' : 'text-scheduled'}
            name={terminal ? 'check' : 'notification'}
            size={21}
          />
        </View>
      </View>

      <Text className="mt-7 font-display-semibold text-[30px] leading-[36px] text-foreground">
        {detail.title}
      </Text>
      {detail.contextNote ? (
        <Text className="mt-2 font-inter text-[15px] leading-6 text-muted-foreground">
          {detail.contextNote}
        </Text>
      ) : null}

      <View className="mt-5 flex-row items-center border-t border-taupe pt-4">
        <SymbolIcon className="text-muted-foreground" name="calendar" size={17} />
        <Text className="ml-2 flex-1 font-inter text-[13px] text-muted-foreground">
          {recurrenceLabel(detail)}
        </Text>
        <Text className="font-inter text-[12px] text-subtle-foreground" numberOfLines={1}>
          {detail.schedule.timezone}
        </Text>
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
    <View className="border-b border-taupe py-5">
      <Text className="mb-3 font-inter-semibold text-[12px] text-muted-foreground">ACTIONS</Text>
      {canComplete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          className={cn(
            'min-h-[60px] flex-row items-center rounded-[16px] bg-ink px-4',
            busy && 'opacity-50',
          )}
          disabled={busy}
          onPress={onComplete}
        >
          <View className="size-9 items-center justify-center rounded-full bg-kast-lime">
            <AuthIcon color="#121510" name="check" size={19} />
          </View>
          <View className="ml-3 flex-1">
            <Text className="font-inter-semibold text-[15px] text-white">Complete reminder</Text>
            <Text className="mt-0.5 font-inter text-[12px] text-white/60">
              Mark this occurrence as done
            </Text>
          </View>
          <AuthIcon color="#B8F34A" name="arrow-right" size={19} />
        </Pressable>
      ) : null}
      <View className={cn('mt-1', canComplete && 'mt-3')}>
        <ActionButton
          description="Move this occurrence 10 minutes later"
          icon="snooze"
          label="Snooze for 10 minutes"
          disabled={busy}
          onPress={onSnooze}
        />
        <Divider />
        <ActionButton
          description="Choose a new date or time"
          icon="calendar"
          label="Reschedule"
          disabled={busy}
          onPress={onReschedule}
        />
        {recurring ? (
          <>
            <Divider />
            <ActionButton
              description="Leave the rest of the series unchanged"
              icon="skip-forward"
              label="Skip this occurrence"
              disabled={busy}
              onPress={onSkip}
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  description,
  disabled,
  onPress,
}: {
  icon: AuthIconName;
  label: string;
  description: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(
        'min-h-[76px] flex-row items-center px-4 py-3 active:bg-secondary-fill',
        disabled && 'opacity-50',
      )}
      disabled={disabled}
      onPress={onPress}
    >
      <View className="size-10 items-center justify-center rounded-[12px] bg-secondary-fill">
        <AuthIcon color={colors.accent} name={icon} size={20} />
      </View>
      <View className="ml-3 flex-1 pr-3">
        <Text className="font-inter-semibold text-[15px] text-foreground">{label}</Text>
        <Text className="mt-1 font-inter text-[12px] leading-4 text-muted-foreground">
          {description}
        </Text>
      </View>
      <SymbolIcon className="text-subtle-foreground" name="chevron" size={22} />
    </Pressable>
  );
}

function OccurrenceTimeline({
  occurrences,
  selectedId,
  locale,
  timezone,
  timeFormat,
  now,
  onSelect,
}: {
  occurrences: ReminderDetail['occurrences'];
  selectedId: string;
  locale: string;
  timezone: string;
  timeFormat: '12-hour' | '24-hour';
  now: number;
  onSelect: (occurrenceId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const scheduledCount = occurrences.filter((item) => item.lifecycle === 'SCHEDULED').length;
  const finishedCount = occurrences.length - scheduledCount;
  const selectedIndex = Math.max(
    0,
    occurrences.findIndex((item) => item.id === selectedId),
  );
  const windowStart = Math.max(
    0,
    Math.min(selectedIndex - 2, Math.max(0, occurrences.length - 5)),
  );
  const visibleOccurrences =
    expanded || occurrences.length <= 5
      ? occurrences
      : occurrences.slice(windowStart, windowStart + 5);

  return (
    <View className="border-y border-taupe">
      <View className="flex-row items-center px-4 py-4">
        <View className="size-10 items-center justify-center rounded-full bg-intelligence-soft">
          <SymbolIcon className="text-accent" name="repeat" size={20} />
        </View>
        <View className="ml-3 flex-1">
          <Text className="font-inter-semibold text-[16px] text-foreground">Schedule timeline</Text>
          <Text className="mt-1 font-inter text-[12px] tabular-nums text-muted-foreground">
            {occurrences.length} total · {scheduledCount} scheduled · {finishedCount} finished
          </Text>
        </View>
      </View>

      <View className="h-px bg-secondary-fill" />

      {visibleOccurrences.map((occurrence, index) => (
        <View key={occurrence.id}>
          {index > 0 ? <View className="ml-[76px] h-px bg-secondary-fill" /> : null}
          <OccurrenceRow
            locale={locale}
            now={now}
            occurrence={occurrence}
            selected={occurrence.id === selectedId}
            timeFormat={timeFormat}
            timezone={timezone}
            onPress={() => onSelect(occurrence.id)}
          />
        </View>
      ))}

      {occurrences.length > 5 ? (
        <>
          <View className="h-px bg-secondary-fill" />
          <Pressable
            accessibilityRole="button"
            className="min-h-12 items-center justify-center active:bg-canvas"
            onPress={() => setExpanded((current) => !current)}
          >
            <Text className="font-inter-semibold text-[13px] text-accent">
              {expanded ? 'Show fewer occurrences' : `View all ${occurrences.length} occurrences`}
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

function OccurrenceRow({
  occurrence,
  selected,
  locale,
  timezone,
  timeFormat,
  now,
  onPress,
}: {
  occurrence: ReminderDetail['occurrences'][number];
  selected: boolean;
  locale: string;
  timezone: string;
  timeFormat: '12-hour' | '24-hour';
  now: number;
  onPress: () => void;
}) {
  const status = occurrenceTimelineStatus(occurrence, now);
  const date = new Date(occurrence.effectiveScheduledAt);

  return (
    <Pressable
      accessibilityHint="Shows the details and actions for this occurrence"
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={cn(
        'min-h-[76px] flex-row items-center px-4 py-3 active:bg-canvas',
        selected && 'bg-intelligence-soft',
      )}
      onPress={onPress}
    >
      <View className="w-11 items-center">
        <Text className="font-inter-semibold text-[10px] text-muted-foreground">
          {formatOccurrenceMonth(date, locale, timezone)}
        </Text>
        <Text className="mt-0.5 font-display-semibold text-[22px] tabular-nums text-foreground">
          {formatOccurrenceDay(date, locale, timezone)}
        </Text>
      </View>
      <View className="mx-4 h-10 w-px bg-taupe" />
      <View className="flex-1">
        <Text className="font-inter-semibold text-[14px] text-foreground">
          Occurrence {occurrence.sequence}
        </Text>
        <Text className="mt-1 font-inter text-[12px] tabular-nums text-muted-foreground">
          {formatOccurrenceWeekdayTime(date, locale, timezone, timeFormat)}
        </Text>
      </View>
      <View className={cn('rounded-full px-2.5 py-1', occurrenceStatusTone(status))}>
        <Text className={cn('font-inter-semibold text-[10px]', occurrenceStatusTextTone(status))}>
          {status}
        </Text>
      </View>
      {selected ? (
        <View className="ml-2 size-6 items-center justify-center rounded-full bg-ink">
          <SymbolIcon className="text-kast-lime" name="check" size={14} />
        </View>
      ) : (
        <SymbolIcon className="ml-1 text-subtle-foreground" name="chevron" size={22} />
      )}
    </Pressable>
  );
}

function NudgeControl({
  enabled,
  intervalMinutes,
  disabled,
  onToggle,
  onSave,
}: {
  enabled: boolean;
  intervalMinutes: number;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
  onSave: (intervalMinutes: number) => void;
}) {
  const { colors, isDark } = useAppTheme();
  const [draftMinutes, setDraftMinutes] = useState(intervalMinutes);

  return (
    <View className="border-y border-taupe py-4">
      <View className="min-h-14 flex-row items-center">
        <View className="flex-1 pr-4">
          <Text className="font-inter-semibold text-[16px] text-foreground">Nudge me again</Text>
          <Text className="mt-1 font-inter text-[13px] leading-5 text-muted-foreground">
            Send one follow-up while this reminder is still open.
          </Text>
        </View>
        <AppleSwitch
          disabled={disabled}
          label="Enable follow-up nudge"
          value={enabled}
          onValueChange={onToggle}
        />
      </View>

      {enabled ? (
        <View className="mt-4 border-t border-secondary-fill pt-4">
          <View className="flex-row items-end justify-between">
            <View>
              <Text className="font-inter-medium text-[11px] text-muted-foreground">FOLLOW UP AFTER</Text>
              <Text className="mt-1 font-inter-bold text-[24px] text-foreground">
                {draftMinutes === 60 ? '1 hour' : `${draftMinutes} min`}
              </Text>
            </View>
            {draftMinutes !== intervalMinutes ? (
              <Pressable
                accessibilityRole="button"
                className="min-h-10 items-center justify-center rounded-full bg-ink px-4"
                disabled={disabled}
                onPress={() => onSave(draftMinutes)}
              >
                <Text className="font-inter-semibold text-[13px] text-white">Apply</Text>
              </Pressable>
            ) : (
              <Text className="pb-2 font-inter-medium text-[12px] text-muted-foreground">Saved</Text>
            )}
          </View>
          <NativeSlider
            disabled={disabled}
            maximumTrackTintColor={isDark ? '#2A2E28' : '#E7E9E2'}
            maximumValue={60}
            minimumTrackTintColor={colors.accent}
            minimumValue={15}
            step={15}
            style={{ width: '100%', height: 44 }}
            thumbTintColor={colors.paper}
            value={draftMinutes}
            onValueChange={(value) => setDraftMinutes(Math.round(value / 15) * 15)}
          />
          <View className="flex-row justify-between px-1">
            <Text className="font-inter text-[11px] text-subtle-foreground">15 min</Text>
            <Text className="font-inter text-[11px] text-subtle-foreground">1 hour</Text>
          </View>
        </View>
      ) : null}
    </View>
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
  const { state } = useOnboarding();
  const recurring = detail.schedule.type !== 'ONE_TIME';
  const [scope, setScope] = useState<EditScope>('THIS_OCCURRENCE');
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [dateTime, setDateTime] = useState(() =>
    fromLocalParts(occurrence.localDate, occurrence.localTime),
  );
  const [pickerDraft, setPickerDraft] = useState(dateTime);
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

  function openPicker(mode: Exclude<PickerMode, null>) {
    setPickerDraft(dateTime);
    setPickerMode(mode);
  }

  function applyPickerSelection() {
    if (!pickerMode) return;
    setDateTime(
      pickerMode === 'date'
        ? mergeDate(dateTime, pickerDraft)
        : mergeTime(dateTime, pickerDraft),
    );
    key.current = createIdempotencyKey('reschedule');
    setPickerMode(null);
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

          <View className="mt-6 overflow-hidden rounded-[18px] bg-paper">
            <DateRow
              icon="calendar"
              label="Date"
              onPress={() => openPicker('date')}
              value={formatDisplayDate(dateTime, state.preferences.locale)}
            />
            <Divider />
            <DateRow
              icon="clock"
              label="Time"
              onPress={() => openPicker('time')}
              value={formatDisplayTime(
                dateTime,
                state.preferences.locale,
                state.preferences.timeFormat,
              )}
            />
          </View>

          <View className="mt-7">
            <Button label="Save schedule" loading={mutation.isPending} onPress={() => mutation.mutate()} />
          </View>
        </ScrollView>
        {pickerMode ? (
          <DateTimePickerSheet
            locale={state.preferences.locale}
            minimumDate={pickerMode === 'date' ? startOfDay(new Date()) : undefined}
            mode={pickerMode}
            timeFormat={state.preferences.timeFormat}
            timezone={detail.schedule.timezone}
            value={pickerDraft}
            onCancel={() => setPickerMode(null)}
            onChange={setPickerDraft}
            onConfirm={applyPickerSelection}
          />
        ) : null}
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
        'min-h-[76px] flex-row items-center rounded-[16px] border-2 bg-paper p-4',
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
        <Text className="text-[15px] font-inter-semibold text-foreground">{label}</Text>
        <Text className="font-inter mt-1 text-[12px] leading-4 text-muted-foreground">{description}</Text>
      </View>
    </Pressable>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Text className="mb-3 mt-8 font-display-semibold text-[19px] text-foreground">
      {title}
    </Text>
  );
}

function DetailRow({ icon, label, value }: { icon: SymbolName; label: string; value: string }) {
  return (
    <View className="min-h-[68px] flex-row items-center px-4 py-3">
      <View className="size-9 items-center justify-center rounded-full bg-secondary-fill">
        <SymbolIcon name={icon} size={18} />
      </View>
      <Text className="ml-3 flex-1 text-[15px] font-inter-medium text-foreground">{label}</Text>
      <Text className="font-inter ml-4 max-w-[48%] text-right text-[13px] text-muted-foreground">{value}</Text>
    </View>
  );
}

function DateRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: SymbolName;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-[62px] flex-row items-center px-4 active:bg-canvas"
      onPress={onPress}
    >
      <View className="mr-3 size-9 items-center justify-center rounded-[11px] bg-secondary-fill">
        <SymbolIcon name={icon} size={17} />
      </View>
      <Text className="flex-1 text-[16px] font-inter-medium text-foreground">{label}</Text>
      <Text className="font-inter text-[15px] text-muted-foreground">{value}</Text>
      <SymbolIcon className="ml-2 text-subtle-foreground" name="chevron" size={24} />
    </Pressable>
  );
}

function Divider({ inset = false }: { inset?: boolean }) {
  return <View className={cn('h-px bg-secondary-fill', inset ? 'ml-16' : 'ml-4')} />;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="rounded-[16px] bg-paper p-5">
      <Text className="text-[19px] font-inter-semibold text-foreground">Reminder unavailable</Text>
      <Text className="font-inter mt-2 text-[14px] leading-5 text-muted-foreground">{message}</Text>
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

type OccurrenceTimelineStatus = 'UPCOMING' | 'OVERDUE' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';

function occurrenceTimelineStatus(
  occurrence: ReminderDetail['occurrences'][number],
  now: number,
): OccurrenceTimelineStatus {
  if (occurrence.lifecycle === 'SCHEDULED') {
    return new Date(occurrence.effectiveScheduledAt).getTime() <= now ? 'OVERDUE' : 'UPCOMING';
  }
  return occurrence.lifecycle;
}

function occurrenceStatusTone(status: OccurrenceTimelineStatus) {
  switch (status) {
    case 'OVERDUE':
      return 'bg-warning-soft';
    case 'COMPLETED':
      return 'bg-completed-soft';
    case 'CANCELLED':
      return 'bg-urgent-soft';
    case 'SKIPPED':
      return 'bg-secondary-fill';
    case 'UPCOMING':
      return 'bg-scheduled-soft';
  }
}

function occurrenceStatusTextTone(status: OccurrenceTimelineStatus) {
  switch (status) {
    case 'OVERDUE':
      return 'text-warning';
    case 'COMPLETED':
      return 'text-completed';
    case 'CANCELLED':
      return 'text-urgent';
    case 'SKIPPED':
      return 'text-muted-foreground';
    case 'UPCOMING':
      return 'text-scheduled';
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

function formatOccurrenceTime(
  instant: Date,
  timezone: string,
  locale: string,
  format: '12-hour' | '24-hour',
) {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: format === '12-hour',
    timeZone: timezone,
  }).format(instant);
}

function formatOccurrenceDate(instant: Date, timezone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  }).format(instant);
}

function formatOccurrenceMonth(date: Date, locale: string, timezone: string) {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    timeZone: timezone,
  })
    .format(date)
    .replace('.', '')
    .toUpperCase();
}

function formatOccurrenceDay(date: Date, locale: string, timezone: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    timeZone: timezone,
  }).format(date);
}

function formatOccurrenceWeekdayTime(
  date: Date,
  locale: string,
  timezone: string,
  format: '12-hour' | '24-hour',
) {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: format === '12-hour',
    timeZone: timezone,
  }).format(date);
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

function formatDisplayDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatDisplayTime(date: Date, locale: string, format: '12-hour' | '24-hour') {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: format === '12-hour',
  }).format(date);
}

function formatLocalSchedule(
  localDate: string,
  localTime: string,
  locale: string,
  format: '12-hour' | '24-hour',
) {
  const date = fromLocalParts(localDate, localTime);
  return `${formatDisplayDate(date, locale)} · ${formatDisplayTime(date, locale, format)}`;
}

function mergeDate(current: Date, selected: Date) {
  const next = new Date(current);
  next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
  return next;
}

function mergeTime(current: Date, selected: Date) {
  const next = new Date(current);
  next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
  return next;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
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
