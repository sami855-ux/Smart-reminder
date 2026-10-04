import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { formErrorMessage } from '../auth/form-error';
import {
  ContextTriggerFields,
  type ContextTriggerDraft,
} from '../components/reminders/ContextTriggerFields';
import { AppleSwitch } from '../components/ui/AppleSwitch';
import { Button } from '../components/ui/Button';
import { DateTimePickerSheet } from '../components/ui/DateTimePickerSheet';
import { SymbolIcon, type SymbolName } from '../components/ui/SymbolIcon';
import { TextField } from '../components/ui/TextField';
import { useToast } from '../components/ui/ToastProvider';
import { cn } from '../lib/cn';
import { useOnboarding } from '../onboarding/onboarding-context';
import {
  currentLocationForTrigger,
  refreshContextTriggerRuntime,
  requestLocationTriggerPermissions,
} from '../platform/device-triggers/context-trigger-runtime';
import { notificationPermissionAllowsAlerts } from '../platform/notifications/notification-permission';
import { scheduleReminderNotifications } from '../platform/notifications/reminder-notification-scheduler';
import {
  createIdempotencyKey,
  createReminder,
  parseReminder,
  previewReminder,
  type ReminderContentInput,
} from '../reminders/reminder.api';
import { reminderQueryKeys } from '../reminders/reminder.queries';
import type {
  CreatedReminder,
  OccurrenceListItem,
  ReminderPreview,
  ReminderScheduleInput,
} from '../reminders/reminder.schemas';
import { useAppTheme } from '../theme/theme-context';

type CaptureMode = 'natural' | 'manual';
type ManualStep = 'details' | 'schedule' | 'automations';
type PickerMode = 'date' | 'time' | 'end-date' | null;
type ScheduleType = ReminderScheduleInput['type'];
type EndMode = 'none' | 'count' | 'date';
type ChainDraftStep = {
  title: string;
  contextNote: string;
  delayMinutes: string;
  requireChecklist: boolean;
};

const recurrenceOptions: { type: ScheduleType; label: string }[] = [
  { type: 'ONE_TIME', label: 'Once' },
  { type: 'DAILY', label: 'Daily' },
  { type: 'WEEKLY', label: 'Weekly' },
  { type: 'SELECTED_WEEKDAYS', label: 'Custom' },
];
const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function CreateReminderScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status } = useAuth();
  const { state } = useOnboarding();
  const { showToast } = useToast();
  const initialDate = useMemo(() => currentDateAndTime(), []);
  const idempotencyKey = useRef(createIdempotencyKey('create'));
  const [captureMode, setCaptureMode] = useState<CaptureMode>('natural');
  const [manualStep, setManualStep] = useState<ManualStep>('details');
  const [naturalText, setNaturalText] = useState('');
  const [title, setTitle] = useState('');
  const [contextNote, setContextNote] = useState('');
  const [checklistItems, setChecklistItems] = useState<string[]>([]);
  const [chainEnabled, setChainEnabled] = useState(false);
  const [chainName, setChainName] = useState('After this reminder');
  const [chainSteps, setChainSteps] = useState<ChainDraftStep[]>([
    { title: '', contextNote: '', delayMinutes: '0', requireChecklist: false },
  ]);
  const [contextTriggers, setContextTriggers] = useState<ContextTriggerDraft[]>([]);
  const [capturingTriggerId, setCapturingTriggerId] = useState<string | null>(null);
  const [scheduleType, setScheduleType] = useState<ScheduleType>('ONE_TIME');
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [endMode, setEndMode] = useState<EndMode>('none');
  const [occurrenceCount, setOccurrenceCount] = useState('');
  const [dateTime, setDateTime] = useState(initialDate);
  const [endDate, setEndDate] = useState(() => addDays(initialDate, 30));
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [pickerDraft, setPickerDraft] = useState(initialDate);
  const [preview, setPreview] = useState<ReminderPreview | null>(null);
  const [parserMessages, setParserMessages] = useState<string[]>([]);
  const [inferred, setInferred] = useState<Set<string>>(() => new Set());

  const previewMutation = useMutation({ mutationFn: previewReminder });
  const parseMutation = useMutation({ mutationFn: parseReminder });
  const createMutation = useMutation({
    mutationFn: (input: ReminderContentInput & { confirmedResolvedAt: string }) =>
      createReminder(input, idempotencyKey.current),
  });

  if (status !== 'authenticated') return <Redirect href="/" />;

  function invalidatePreview() {
    if (preview) setPreview(null);
    idempotencyKey.current = createIdempotencyKey('create');
  }

  function markEdited(field: string) {
    setInferred((current) => {
      if (!current.has(field)) return current;
      const next = new Set(current);
      next.delete(field);
      return next;
    });
  }

  function buildInput(): ReminderContentInput | null {
    const cleanTitle = title.normalize('NFC').trim().replace(/\s+/gu, ' ');
    const cleanNote = contextNote.normalize('NFC').trim();
    const cleanChecklist = checklistItems
      .map((item) => item.normalize('NFC').trim().replace(/\s+/gu, ' '))
      .filter(Boolean);
    const cleanChainName = chainName.normalize('NFC').trim().replace(/\s+/gu, ' ');
    const cleanChainSteps = chainSteps.map((step) => ({
      title: step.title.normalize('NFC').trim().replace(/\s+/gu, ' '),
      contextNote: step.contextNote.normalize('NFC').trim(),
      delayMinutes: Number(step.delayMinutes) || 0,
      condition: step.requireChecklist ? 'ALL_CHECKLIST_COMPLETED' as const : 'PREVIOUS_COMPLETED' as const,
    }));
    const cleanContextTriggers = contextTriggers.map((trigger) => ({
      ...trigger,
      label: trigger.label.normalize('NFC').trim().replace(/\s+/gu, ' '),
      networkName: trigger.networkName.normalize('NFC'),
      radiusMeters: Number(trigger.radius),
    }));
    if (Array.from(cleanTitle).length < 1 || Array.from(cleanTitle).length > 120) {
      showToast({
        title: 'Check the title',
        message: 'Use a title between 1 and 120 characters.',
        tone: 'error',
      });
      return null;
    }
    if (Array.from(cleanNote).length > 2000) {
      showToast({
        title: 'Note is too long',
        message: 'Keep the context note under 2,000 characters.',
        tone: 'error',
      });
      return null;
    }
    if (cleanChecklist.some((item) => Array.from(item).length > 240)) {
      showToast({
        title: 'Checklist item is too long',
        message: 'Keep every checklist item under 240 characters.',
        tone: 'error',
      });
      return null;
    }
    if (
      chainEnabled &&
      (!cleanChainName ||
        cleanChainSteps.length === 0 ||
        cleanChainSteps.some((step) =>
          !step.title ||
          Array.from(step.title).length > 120 ||
          Array.from(step.contextNote).length > 2000 ||
          !Number.isInteger(step.delayMinutes) ||
          step.delayMinutes < 0 ||
          step.delayMinutes > 43_200
        ))
    ) {
      showToast({
        title: 'Check the reminder chain',
        message: 'Give every step a title and use a delay from 0 to 43,200 minutes.',
        tone: 'error',
      });
      return null;
    }
    const invalidContextTrigger = cleanContextTriggers.find((trigger) =>
      !trigger.label ||
      Array.from(trigger.label).length > 120 ||
      (trigger.type === 'WIFI_CONNECT'
        ? Array.from(trigger.networkName).length < 1 || Array.from(trigger.networkName).length > 128
        : trigger.latitude === undefined ||
          trigger.longitude === undefined ||
          !Number.isInteger(trigger.radiusMeters) ||
          trigger.radiusMeters < 50 ||
          trigger.radiusMeters > 5_000),
    );
    if (invalidContextTrigger) {
      showToast({
        title: 'Check place and Wi-Fi triggers',
        message:
          invalidContextTrigger.type === 'WIFI_CONNECT'
            ? 'Add a label and enter the exact Wi-Fi network name.'
            : 'Add a label, capture the current location, and use a whole-number radius from 50 to 5,000 meters.',
        tone: 'error',
      });
      return null;
    }
    if (scheduleType === 'SELECTED_WEEKDAYS' && selectedWeekdays.length === 0) {
      showToast({
        title: 'Choose at least one day',
        message: 'A custom weekly schedule needs one or more weekdays.',
        tone: 'error',
      });
      return null;
    }
    const count = occurrenceCount.trim() ? Number(occurrenceCount) : null;
    if (
      scheduleType !== 'ONE_TIME' &&
      endMode === 'count' &&
      (count === null || !Number.isInteger(count) || count < 1 || count > 500)
    ) {
      showToast({
        title: 'Check the occurrence count',
        message: 'Use a whole number from 1 through 500.',
        tone: 'error',
      });
      return null;
    }

    return {
      title: cleanTitle,
      ...(cleanNote ? { contextNote: cleanNote } : {}),
      ...(cleanChecklist.length ? { checklist: cleanChecklist.map((text) => ({ text })) } : {}),
      ...(chainEnabled
        ? {
            workflow: {
              name: cleanChainName,
              steps: cleanChainSteps.map((step) => ({
                title: step.title,
                ...(step.contextNote ? { contextNote: step.contextNote } : {}),
                delayMinutes: step.delayMinutes,
                condition: step.condition,
              })),
            },
          }
        : {}),
      ...(cleanContextTriggers.length
        ? {
            contextTriggers: cleanContextTriggers.map((trigger) =>
              trigger.type === 'WIFI_CONNECT'
                ? {
                    type: trigger.type,
                    label: trigger.label,
                    networkName: trigger.networkName,
                    cooldownSeconds: 300,
                  }
                : {
                    type: trigger.type,
                    label: trigger.label,
                    latitude: trigger.latitude,
                    longitude: trigger.longitude,
                    radiusMeters: trigger.radiusMeters,
                    cooldownSeconds: 300,
                  },
            ),
          }
        : {}),
      schedule: {
        type: scheduleType,
        localDate: formatLocalDate(dateTime),
        localTime: formatLocalTime(dateTime),
        timezone: state.preferences.timezone,
        ...(scheduleType === 'SELECTED_WEEKDAYS'
          ? { weekdays: selectedWeekdays }
          : {}),
        ...(scheduleType !== 'ONE_TIME' && endMode === 'count' && count !== null
          ? { occurrenceCount: count }
          : {}),
        ...(scheduleType !== 'ONE_TIME' && endMode === 'date'
          ? { endDate: formatLocalDate(endDate) }
          : {}),
      },
    };
  }

  async function requestPreview() {
    const input = buildInput();
    if (!input) return;
    try {
      const result = await previewMutation.mutateAsync(input);
      setPreview(result);
    } catch (error) {
      showToast({
        title: 'Couldn’t preview this reminder',
        message: formErrorMessage(error),
        tone: 'error',
      });
    }
  }

  async function captureTriggerLocation(triggerId: string) {
    setCapturingTriggerId(triggerId);
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
      setContextTriggers((current) =>
        current.map((trigger) => trigger.id === triggerId ? { ...trigger, ...location } : trigger),
      );
      invalidatePreview();
      showToast({ title: 'Location captured', message: 'The encrypted geofence center is ready.', tone: 'success' });
    } catch (error) {
      showToast({ title: 'Couldn’t capture location', message: formErrorMessage(error), tone: 'error' });
    } finally {
      setCapturingTriggerId(null);
    }
  }

  async function parseDraft() {
    if (!naturalText.trim()) {
      showToast({
        title: 'Describe the reminder',
        message: 'For example: “Tomorrow at 9, call John.”',
        tone: 'error',
      });
      return;
    }
    try {
      const result = await parseMutation.mutateAsync({
        text: naturalText,
        referenceInstant: new Date().toISOString(),
        locale: state.preferences.locale,
        timezone: state.preferences.timezone,
        timeFormat: state.preferences.timeFormat,
      });
      const structured = result.structured;
      setInferred(new Set(result.inferredFields));
      setParserMessages([
        ...result.ambiguities.map((item) => item.message),
        ...result.warnings.map((item) => item.message),
      ]);
      if (structured?.title) setTitle(structured.title);
      if (structured?.localDate && structured.localTime) {
        setDateTime(fromLocalParts(structured.localDate, structured.localTime));
      }
      if (structured) {
        setScheduleType(structured.recurrence.type);
        setSelectedWeekdays(structured.recurrence.weekdays);
      }
      setPreview(
        result.preview && structured?.title
          ? {
              title: structured.title,
              contextNote: structured.contextNote,
              schedule: result.preview,
              requiresConfirmation: true,
              persisted: false,
            }
          : null,
      );
      setCaptureMode('manual');
      setManualStep('details');
      showToast({
        title: result.status === 'SUCCESS' ? 'Draft interpreted' : 'Review needed',
        message:
          result.status === 'SUCCESS'
            ? 'Every inferred field is editable before you save.'
            : 'Complete the highlighted details before previewing.',
        tone: result.status === 'SUCCESS' ? 'success' : 'info',
      });
    } catch (error) {
      showToast({
        title: 'Couldn’t interpret the draft',
        message: `${formErrorMessage(error)} Your text is still here; use the manual fields below.`,
        tone: 'error',
      });
      setCaptureMode('manual');
    }
  }

  async function confirmCreate() {
    const input = buildInput();
    if (!input || !preview) return;
    try {
      const created = await createMutation.mutateAsync({
        ...input,
        confirmedResolvedAt: preview.schedule.resolvedAt,
      });
      queryClient.setQueryData(reminderQueryKeys.detail(created.id), created);
      queryClient.setQueriesData<{
        items: OccurrenceListItem[];
        nextCursor: string | null;
      }>(
        { queryKey: reminderQueryKeys.occurrenceLists() },
        (current) => addCreatedOccurrences(current, created),
      );
      void queryClient.invalidateQueries({
        queryKey: reminderQueryKeys.occurrenceLists(),
        refetchType: 'none',
      });
      if (input.contextTriggers?.length) {
        void refreshContextTriggerRuntime().catch(() => {
          showToast({
            title: 'Reminder saved',
            message: 'Context monitoring will retry when the app returns to the foreground.',
            tone: 'info',
          });
        });
      }
      showToast({
        title: 'Reminder created',
        message:
          notificationPermissionAllowsAlerts(state.notificationPermission)
            ? 'Saved. Device alerts are syncing in the background.'
            : 'Saved. Enable notifications when you want device alerts.',
        tone: 'success',
      });
      router.replace({
        pathname: '/reminders/[reminderId]',
        params: { reminderId: created.id },
      });

      if (notificationPermissionAllowsAlerts(state.notificationPermission)) {
        void scheduleReminderNotifications(created, { nudgePolicy: null })
          .then((scheduling) => {
            if (scheduling.status !== 'failed' && scheduling.status !== 'unavailable') return;
            showToast({
              title: 'Reminder saved',
              message:
                scheduling.status === 'unavailable'
                  ? 'Device alerts are unavailable in this build. Open Notification settings and run the test alert.'
                  : 'Device alerts will be retried the next time the app syncs.',
              tone: 'info',
            });
          })
          .catch(() => {
            showToast({
              title: 'Reminder saved',
              message: 'Device alerts will be retried the next time the app syncs.',
              tone: 'info',
            });
          });
      }
    } catch (error) {
      showToast({
        title: 'Couldn’t create the reminder',
        message: formErrorMessage(error),
        tone: 'error',
      });
    }
  }

  function openPicker(mode: Exclude<PickerMode, null>) {
    setPickerDraft(mode === 'end-date' ? endDate : dateTime);
    setPickerMode(mode);
  }

  function applyPickerSelection() {
    if (!pickerMode) return;
    if (pickerMode === 'end-date') {
      setEndDate(mergeDate(endDate, pickerDraft));
      invalidatePreview();
    } else {
      const next =
        pickerMode === 'date'
          ? mergeDate(dateTime, pickerDraft)
          : mergeTime(dateTime, pickerDraft);
      setDateTime(next);
      if (pickerMode === 'date' && endDate < next) {
        setEndDate(addDays(next, 30));
      }
      markEdited(pickerMode);
      invalidatePreview();
    }
    setPickerMode(null);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="items-center pb-1 pt-2">
          <View className="h-1 w-10 rounded-full bg-taupe" />
        </View>
        <View className="h-14 flex-row items-center justify-between px-4">
          <Pressable
            accessibilityLabel="Close reminder creation"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full active:bg-secondary-fill"
            onPress={() => router.back()}
          >
            <Text className="text-[28px] font-inter text-foreground">×</Text>
          </Pressable>
          <Text className="font-display-semibold text-[17px] text-foreground">Add reminder</Text>
          <View className="size-11" />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="pb-12"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full max-w-[680px] self-center px-5">
            <Text
              accessibilityRole="header"
              className="mt-2 font-display-semibold text-[34px] leading-[40px] text-foreground"
            >
              {captureMode === 'natural' ? 'What should stay on your radar?' : 'Build your reminder'}
            </Text>
            <Text className="font-inter mt-3 text-[16px] leading-6 text-muted-foreground">
              {captureMode === 'natural'
                ? 'Describe it naturally, then review every inferred detail before saving.'
                : 'Move through three focused steps. Your draft stays here until you confirm it.'}
            </Text>

            <SegmentedControl value={captureMode} onChange={setCaptureMode} />

            {captureMode === 'natural' ? (
              <View className="mt-5 rounded-[16px] border border-taupe bg-paper p-4">
                <Text className="mb-2 text-[13px] font-inter-semibold text-muted-foreground">
                  DESCRIBE IT
                </Text>
                <TextInput
                  accessibilityLabel="Natural language reminder"
                  className="min-h-[128px] text-[18px] leading-7 text-foreground"
                  maxLength={2000}
                  multiline
                  onChangeText={setNaturalText}
                  placeholder="Tomorrow at 9, remind me to call John"
                  placeholderTextColor={colors.muted}
                  textAlignVertical="top"
                  value={naturalText}
                />
                <Button
                  label="Interpret reminder"
                  loading={parseMutation.isPending}
                  onPress={() => void parseDraft()}
                />
              </View>
            ) : (
              <View className="mt-5 gap-5">
                <ManualStepTabs value={manualStep} onChange={setManualStep} />

                {parserMessages.length > 0 ? (
                  <View className="rounded-[16px] bg-intelligence-soft p-4">
                    <Text className="text-[14px] font-inter-semibold text-foreground">Review the draft</Text>
                    {parserMessages.map((message) => (
                      <Text key={message} className="font-inter mt-1.5 text-[13px] leading-5 text-muted-foreground">
                        • {message}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {manualStep === 'details' ? (
                  <View className="gap-5">
                    <ManualStepHeader
                      description="Name the reminder and add any checkable items you need when it is due."
                      eyebrow="STEP 1 OF 3"
                      title="Reminder details"
                    />
                <TextField
                  label={inferred.has('title') ? 'Title · inferred' : 'Title'}
                  maxLength={120}
                  onChangeText={(value) => {
                    setTitle(value);
                    markEdited('title');
                    invalidatePreview();
                  }}
                  placeholder="Call John"
                  value={title}
                />
                <TextField
                  label="Context note · optional"
                  maxLength={2000}
                  multiline
                  onChangeText={(value) => {
                    setContextNote(value);
                    invalidatePreview();
                  }}
                  placeholder="Anything useful when it’s time"
                  value={contextNote}
                />

                <View className="border-y border-taupe py-3">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-4">
                      <Text className="text-[13px] font-inter-semibold text-muted-foreground">CHECKLIST · OPTIONAL</Text>
                      <Text className="font-inter mt-1 text-[12px] leading-5 text-muted-foreground">
                        Each recurring occurrence gets a fresh copy.
                      </Text>
                    </View>
                    {checklistItems.length < 50 ? (
                      <Pressable
                        accessibilityRole="button"
                        hitSlop={10}
                        onPress={() => {
                          setChecklistItems((current) => [...current, '']);
                          invalidatePreview();
                        }}
                      >
                        <Text className="text-[14px] font-inter-semibold text-intelligence">Add item</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {checklistItems.map((item, index) => (
                    <View className="mt-4 flex-row items-end gap-3" key={`checklist-${index}`}>
                      <View className="flex-1">
                        <TextField
                          label={`Item ${index + 1}`}
                          maxLength={240}
                          onChangeText={(value) => {
                            setChecklistItems((current) => current.map((entry, itemIndex) => itemIndex === index ? value : entry));
                            invalidatePreview();
                          }}
                          placeholder="Add a checkable step"
                          value={item}
                        />
                      </View>
                      <Pressable
                        accessibilityLabel={`Remove checklist item ${index + 1}`}
                        accessibilityRole="button"
                        className="mb-1 min-h-11 justify-center"
                        onPress={() => {
                          setChecklistItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
                          invalidatePreview();
                        }}
                      >
                        <Text className="text-[13px] font-inter-semibold text-urgent">Remove</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>

                    <ManualStepNavigation
                      nextLabel="Continue to schedule"
                      onNext={() => setManualStep('schedule')}
                    />
                  </View>
                ) : null}

                {manualStep === 'automations' ? (
                  <View className="gap-5">
                    <ManualStepHeader
                      description="Optionally create follow-ups or make another copy due when device context matches."
                      eyebrow="STEP 3 OF 3"
                      title="Automations"
                    />
                <View className="border-b border-taupe pb-4">
                  <View className="min-h-14 flex-row items-center justify-between">
                    <View className="flex-1 pr-4">
                      <Text className="text-[13px] font-inter-semibold text-muted-foreground">CHAINED REMINDERS · OPTIONAL</Text>
                      <Text className="font-inter mt-1 text-[12px] leading-5 text-muted-foreground">
                        Completing this reminder creates the first follow-up.
                      </Text>
                    </View>
                    <AppleSwitch
                      label="Create a chained reminder workflow"
                      value={chainEnabled}
                      onValueChange={(enabled) => {
                        setChainEnabled(enabled);
                        invalidatePreview();
                      }}
                    />
                  </View>
                  {chainEnabled ? (
                    <View className="mt-3 gap-5">
                      <TextField
                        label="Chain name"
                        maxLength={120}
                        onChangeText={(value) => {
                          setChainName(value);
                          invalidatePreview();
                        }}
                        value={chainName}
                      />
                      {chainSteps.map((step, index) => (
                        <View className="border-t border-secondary-fill pt-4" key={`chain-step-${index}`}>
                          <View className="mb-3 flex-row items-center justify-between">
                            <Text className="text-[14px] font-inter-semibold text-foreground">Follow-up {index + 1}</Text>
                            {chainSteps.length > 1 ? (
                              <Pressable
                                accessibilityLabel={`Remove follow-up ${index + 1}`}
                                accessibilityRole="button"
                                hitSlop={8}
                                onPress={() => {
                                  setChainSteps((current) => current.filter((_, itemIndex) => itemIndex !== index));
                                  invalidatePreview();
                                }}
                              >
                                <Text className="text-[13px] font-inter-semibold text-urgent">Remove</Text>
                              </Pressable>
                            ) : null}
                          </View>
                          <View className="gap-3">
                            <TextField
                              label="Reminder title"
                              maxLength={120}
                              onChangeText={(value) => {
                                setChainSteps((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, title: value } : entry));
                                invalidatePreview();
                              }}
                              placeholder="Send the proposal"
                              value={step.title}
                            />
                            <TextField
                              label="Note · optional"
                              maxLength={2000}
                              multiline
                              onChangeText={(value) => {
                                setChainSteps((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, contextNote: value } : entry));
                                invalidatePreview();
                              }}
                              value={step.contextNote}
                            />
                            <TextField
                              keyboardType="number-pad"
                              label="Delay after completion · minutes"
                              maxLength={5}
                              onChangeText={(value) => {
                                setChainSteps((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, delayMinutes: value.replace(/\D/gu, '') } : entry));
                                invalidatePreview();
                              }}
                              value={step.delayMinutes}
                            />
                            <View className="min-h-12 flex-row items-center justify-between">
                              <View className="flex-1 pr-4">
                                <Text className="text-[14px] font-inter-medium text-foreground">Require completed checklist</Text>
                                <Text className="font-inter mt-1 text-[12px] leading-5 text-muted-foreground">
                                  Stop before this follow-up if the previous reminder has unchecked items.
                                </Text>
                              </View>
                              <AppleSwitch
                                label={`Require completed checklist before follow-up ${index + 1}`}
                                value={step.requireChecklist}
                                onValueChange={(value) => {
                                  setChainSteps((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, requireChecklist: value } : entry));
                                  invalidatePreview();
                                }}
                              />
                            </View>
                          </View>
                        </View>
                      ))}
                      {chainSteps.length < 20 ? (
                        <Pressable
                          accessibilityRole="button"
                          className="min-h-11 items-start justify-center"
                          onPress={() => {
                            setChainSteps((current) => [...current, { title: '', contextNote: '', delayMinutes: '0', requireChecklist: false }]);
                            invalidatePreview();
                          }}
                        >
                          <Text className="text-[14px] font-inter-semibold text-intelligence">Add another follow-up</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
                  </View>
                ) : null}

                {manualStep === 'schedule' ? (
                  <View className="gap-5">
                    <ManualStepHeader
                      description="Choose the first due time, recurrence, and when a repeating series should stop."
                      eyebrow="STEP 2 OF 3"
                      title="Schedule"
                    />
                <View>
                  <Text className="mb-2 text-[13px] font-inter-semibold text-muted-foreground">WHEN</Text>
                  <View className="flex-row gap-3">
                    <WhenPickerButton
                      inferred={inferred.has('date')}
                      icon="calendar"
                      label="Date"
                      value={formatDisplayDate(dateTime, state.preferences.locale)}
                      onPress={() => openPicker('date')}
                    />
                    <WhenPickerButton
                      inferred={inferred.has('time')}
                      icon="clock"
                      label="Time"
                      value={formatDisplayTime(
                        dateTime,
                        state.preferences.locale,
                        state.preferences.timeFormat,
                      )}
                      onPress={() => openPicker('time')}
                    />
                  </View>
                  <View className="mt-3 flex-row items-center rounded-[14px] bg-secondary-fill px-4 py-3">
                    <View className="size-9 items-center justify-center rounded-[11px] bg-paper">
                      <SymbolIcon name="clock" size={17} />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="font-inter-medium text-[11px] text-muted-foreground">TIMEZONE</Text>
                      <Text className="mt-0.5 font-inter-semibold text-[14px] text-foreground">
                        {state.preferences.timezone}
                      </Text>
                    </View>
                  </View>
                </View>

                <View>
                  <Text className="mb-2 text-[13px] font-inter-semibold text-muted-foreground">
                    {inferred.has('recurrence') ? 'REPEAT · INFERRED' : 'REPEAT'}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {recurrenceOptions.map((option) => (
                      <ChoiceChip
                        key={option.type}
                        label={option.label}
                        selected={scheduleType === option.type}
                        onPress={() => {
                          setScheduleType(option.type);
                          if (option.type === 'ONE_TIME') {
                            setOccurrenceCount('');
                            setEndMode('none');
                          }
                          markEdited('recurrence');
                          invalidatePreview();
                        }}
                      />
                    ))}
                  </View>
                </View>

                {scheduleType === 'SELECTED_WEEKDAYS' ? (
                  <View>
                    <Text className="mb-2 text-[13px] font-inter-semibold text-muted-foreground">DAYS</Text>
                    <View className="flex-row justify-between gap-1.5">
                      {weekdayLabels.map((label, day) => (
                        <Pressable
                          key={`${label}-${day}`}
                          accessibilityLabel={weekdayName(day)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selectedWeekdays.includes(day) }}
                          className={cn(
                            'size-11 items-center justify-center rounded-full border',
                            selectedWeekdays.includes(day)
                              ? 'border-ink bg-ink'
                              : 'border-taupe bg-paper',
                          )}
                          onPress={() => {
                            setSelectedWeekdays((current) =>
                              current.includes(day)
                                ? current.filter((item) => item !== day)
                                : [...current, day].sort(),
                            );
                            markEdited('recurrence');
                            invalidatePreview();
                          }}
                        >
                          <Text
                            className={cn(
                              'text-[14px] font-inter-semibold',
                              selectedWeekdays.includes(day) ? 'text-white' : 'text-foreground',
                            )}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}

                {scheduleType !== 'ONE_TIME' ? (
                  <View className="gap-3">
                    <Text className="text-[13px] font-inter-semibold text-muted-foreground">SERIES END</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {([
                        ['none', 'No end'],
                        ['count', 'After count'],
                        ['date', 'On date'],
                      ] as const).map(([value, label]) => (
                        <ChoiceChip
                          key={value}
                          label={label}
                          selected={endMode === value}
                          onPress={() => {
                            setEndMode(value);
                            invalidatePreview();
                          }}
                        />
                      ))}
                    </View>
                    {endMode === 'count' ? (
                      <TextField
                        keyboardType="number-pad"
                        label="Number of occurrences"
                        maxLength={3}
                        onChangeText={(value) => {
                          setOccurrenceCount(value.replace(/\D/gu, ''));
                          invalidatePreview();
                        }}
                        placeholder="For example, 12"
                        value={occurrenceCount}
                      />
                    ) : null}
                    {endMode === 'date' ? (
                      <FormSection label="END DATE">
                        <DateTimeRow
                          label="Final local date"
                          value={formatDisplayDate(endDate, state.preferences.locale)}
                          onPress={() => openPicker('end-date')}
                        />
                      </FormSection>
                    ) : null}
                  </View>
                ) : null}

                    <ManualStepNavigation
                      backLabel="Back"
                      nextLabel="Continue to automations"
                      onBack={() => setManualStep('details')}
                      onNext={() => setManualStep('automations')}
                    />
                  </View>
                ) : null}

                {manualStep === 'automations' ? (
                  <View className="gap-5">
                <View className="border-y border-taupe py-3">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-4">
                      <Text className="text-[13px] font-inter-semibold text-muted-foreground">
                        PLACE &amp; WI-FI · OPTIONAL
                      </Text>
                      <Text className="font-inter mt-1 text-[12px] leading-5 text-muted-foreground">
                        Also create a due copy when you arrive, leave, or connect to a network.
                      </Text>
                    </View>
                    {contextTriggers.length < 10 ? (
                      <Pressable
                        accessibilityRole="button"
                        className="min-h-11 justify-center"
                        hitSlop={8}
                        onPress={() => {
                          setContextTriggers((current) => [...current, newContextTriggerDraft()]);
                          invalidatePreview();
                        }}
                      >
                        <Text className="font-inter-semibold text-[14px] text-intelligence">Add trigger</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {contextTriggers.map((trigger) => (
                    <View className="mt-4" key={trigger.id}>
                      <ContextTriggerFields
                        capturingLocation={capturingTriggerId === trigger.id}
                        draft={trigger}
                        onCaptureLocation={() => void captureTriggerLocation(trigger.id)}
                        onChange={(next) => {
                          setContextTriggers((current) =>
                            current.map((entry) => entry.id === trigger.id ? next : entry),
                          );
                          invalidatePreview();
                        }}
                        onRemove={() => {
                          setContextTriggers((current) => current.filter((entry) => entry.id !== trigger.id));
                          invalidatePreview();
                        }}
                      />
                    </View>
                  ))}
                  {!contextTriggers.length ? (
                    <Text className="mt-3 font-inter text-[13px] leading-5 text-muted-foreground">
                      No context trigger. The scheduled reminder will still work normally.
                    </Text>
                  ) : null}
                </View>

                    <ManualStepNavigation
                      backLabel="Back"
                      onBack={() => setManualStep('schedule')}
                    />

                <Button
                  label="Review reminder"
                  loading={previewMutation.isPending}
                  onPress={() => void requestPreview()}
                  variant="secondary"
                />

                {preview ? (
                  <PreviewCard
                    contextTriggers={contextTriggers}
                    locale={state.preferences.locale}
                    preview={preview}
                    timeFormat={state.preferences.timeFormat}
                  />
                ) : null}

                {preview ? (
                  <Button
                    label="Create reminder"
                    loading={createMutation.isPending}
                    onPress={() => void confirmCreate()}
                  />
                ) : null}
                  </View>
                ) : null}
              </View>
            )}
          </View>
        </ScrollView>

        {pickerMode ? (
          <DateTimePickerSheet
            locale={state.preferences.locale}
            minimumDate={startOfDay(pickerMode === 'end-date' ? dateTime : new Date())}
            mode={pickerMode === 'time' ? 'time' : 'date'}
            timeFormat={state.preferences.timeFormat}
            timezone={state.preferences.timezone}
            title={pickerMode === 'end-date' ? 'Choose end date' : undefined}
            value={pickerDraft}
            onCancel={() => setPickerMode(null)}
            onChange={setPickerDraft}
            onConfirm={applyPickerSelection}
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SegmentedControl({
  value,
  onChange,
}: {
  value: CaptureMode;
  onChange: (value: CaptureMode) => void;
}) {
  return (
    <View className="mt-7 flex-row rounded-[16px] bg-secondary-fill p-1">
      {(['natural', 'manual'] as const).map((item) => (
        <Pressable
          key={item}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === item }}
          className={cn(
            'min-h-11 flex-1 items-center justify-center rounded-[12px] border',
            value === item
              ? 'border-taupe bg-paper'
              : 'border-transparent bg-transparent',
          )}
          onPress={() => onChange(item)}
        >
          <Text className={cn('text-[15px] font-inter-semibold', value === item ? 'text-foreground' : 'text-muted-foreground')}>
            {item === 'natural' ? 'Quick capture' : 'Manual'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const manualSteps: { value: ManualStep; label: string }[] = [
  { value: 'details', label: 'Details' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'automations', label: 'Automations' },
];

function ManualStepTabs({
  value,
  onChange,
}: {
  value: ManualStep;
  onChange: (value: ManualStep) => void;
}) {
  return (
    <View className="flex-row border-b border-taupe">
      {manualSteps.map((step, index) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: value === step.value }}
          className={cn(
            'min-h-12 flex-1 items-center justify-center border-b-2 px-1',
            value === step.value ? 'border-ink' : 'border-transparent',
          )}
          key={step.value}
          onPress={() => onChange(step.value)}
        >
          <Text
            className={cn(
              'font-inter-semibold text-[13px]',
              value === step.value ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {index + 1}. {step.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ManualStepHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <View className="pt-2">
      <Text className="font-inter-semibold text-[11px] text-intelligence">{eyebrow}</Text>
      <Text accessibilityRole="header" className="mt-2 font-display-semibold text-[26px] leading-8 text-foreground">
        {title}
      </Text>
      <Text className="mt-2 font-inter text-[14px] leading-6 text-muted-foreground">
        {description}
      </Text>
    </View>
  );
}

function ManualStepNavigation({
  backLabel,
  nextLabel,
  onBack,
  onNext,
}: {
  backLabel?: string;
  nextLabel?: string;
  onBack?: () => void;
  onNext?: () => void;
}) {
  return (
    <View className="flex-row items-center gap-3 border-t border-taupe pt-5">
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-12 flex-1 items-center justify-center rounded-[14px] border border-taupe bg-paper active:bg-secondary-fill"
          onPress={onBack}
        >
          <Text className="font-inter-semibold text-[14px] text-foreground">{backLabel}</Text>
        </Pressable>
      ) : null}
      {onNext ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-12 flex-[2] flex-row items-center justify-center rounded-[14px] bg-ink px-4 active:opacity-80"
          onPress={onNext}
        >
          <Text className="font-inter-semibold text-[14px] text-white">{nextLabel}</Text>
          <SymbolIcon className="ml-2 text-kast-lime" name="chevron" size={20} />
        </Pressable>
      ) : null}
    </View>
  );
}

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text className="mb-2 text-[13px] font-inter-semibold text-muted-foreground">{label}</Text>
      <View className="overflow-hidden rounded-[16px] border border-taupe bg-paper">{children}</View>
    </View>
  );
}

function WhenPickerButton({
  label,
  value,
  icon,
  inferred,
  onPress,
}: {
  label: string;
  value: string;
  icon: SymbolName;
  inferred: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-[112px] flex-1 justify-between rounded-[18px] bg-paper p-4 active:bg-secondary-fill"
      onPress={onPress}
    >
      <View className="flex-row items-center justify-between">
        <View className="size-9 items-center justify-center rounded-[11px] bg-secondary-fill">
          <SymbolIcon name={icon} size={18} />
        </View>
        <SymbolIcon className="text-subtle-foreground" name="chevron" size={21} />
      </View>
      <View className="mt-4">
        <Text className="font-inter-medium text-[11px] text-muted-foreground">
          {inferred ? `${label.toUpperCase()} · INFERRED` : label.toUpperCase()}
        </Text>
        <Text className="mt-1 font-inter-semibold text-[15px] text-foreground" numberOfLines={2}>
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

function DateTimeRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-[58px] flex-row items-center px-4 active:bg-canvas"
      onPress={onPress}
    >
      <Text className="flex-1 text-[16px] font-inter-medium text-foreground">{label}</Text>
      <Text className="text-[15px] font-inter-medium text-muted-foreground">{value}</Text>
      <SymbolIcon className="ml-2 text-subtle-foreground" name="chevron" size={21} />
    </Pressable>
  );
}

function ChoiceChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={cn(
        'min-h-11 items-center justify-center rounded-full border px-4',
        selected ? 'border-ink bg-ink' : 'border-taupe bg-paper',
      )}
      onPress={onPress}
    >
      <Text className={cn('text-[14px] font-inter-semibold', selected ? 'text-white' : 'text-foreground')}>
        {label}
      </Text>
    </Pressable>
  );
}

function PreviewCard({
  preview,
  contextTriggers,
  locale,
  timeFormat,
}: {
  preview: ReminderPreview;
  contextTriggers: ContextTriggerDraft[];
  locale: string;
  timeFormat: '12-hour' | '24-hour';
}) {
  const instant = new Date(preview.schedule.resolvedAt);
  return (
    <View className="rounded-[16px] bg-ink p-5">
      <Text className="font-inter-semibold text-[12px] text-white/60">READY TO SAVE</Text>
      <Text className="mt-3 text-[22px] font-inter-semibold leading-7 text-white">{preview.title}</Text>
      <Text className="font-inter mt-3 text-[15px] leading-6 text-white/75">
        {new Intl.DateTimeFormat(locale, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: timeFormat === '12-hour',
          timeZone: preview.schedule.timezone,
        }).format(instant)}
      </Text>
      <View className="mt-4 gap-2 border-t border-white/15 pt-4">
        <PreviewLine label="Timezone" value={preview.schedule.timezone} />
        <PreviewLine label="Repeat" value={preview.schedule.recurrenceSummary} />
        <PreviewLine
          label="UTC offset"
          value={formatOffset(preview.schedule.utcOffsetMinutes)}
        />
        {contextTriggers.length ? (
          <PreviewLine
            label="Context"
            value={contextTriggers
              .map((trigger) => `${triggerTypeLabel(trigger.type)} · ${trigger.label.trim() || 'Untitled'}`)
              .join(', ')}
          />
        ) : null}
      </View>
      {preview.schedule.adjustments.map((adjustment) => (
        <Text key={adjustment.code} className="font-inter mt-4 text-[13px] leading-5 text-white/75">
          {adjustment.message}
        </Text>
      ))}
    </View>
  );
}

function newContextTriggerDraft(): ContextTriggerDraft {
  return {
    id: `trigger-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'LOCATION_ARRIVE',
    label: '',
    networkName: '',
    radius: '150',
  };
}

function triggerTypeLabel(type: ContextTriggerDraft['type']) {
  if (type === 'LOCATION_ARRIVE') return 'Arrive';
  if (type === 'LOCATION_LEAVE') return 'Leave';
  return 'Wi-Fi';
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-4">
      <Text className="font-inter w-24 text-[13px] text-white/50">{label}</Text>
      <Text className="flex-1 text-right text-[13px] font-inter-medium text-white">{value}</Text>
    </View>
  );
}

function currentDateAndTime() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 1, 0, 0);
  return date;
}

function addCreatedOccurrences(
  current: { items: OccurrenceListItem[]; nextCursor: string | null } | undefined,
  reminder: CreatedReminder,
) {
  if (!current) return current;
  const createdItems: OccurrenceListItem[] = reminder.occurrences.map((occurrence) => ({
    id: occurrence.id,
    reminderId: reminder.id,
    title: reminder.title,
    contextNote: reminder.contextNote,
    reminderRevision: reminder.revision,
    scheduleId: occurrence.scheduleId,
    scheduleRevision: occurrence.scheduleRevision,
    scheduleType: reminder.schedule.type,
    timezone: reminder.schedule.timezone,
    weekdays: reminder.schedule.weekdays,
    sequence: occurrence.sequence,
    lifecycle: occurrence.lifecycle,
    localDate: occurrence.localDate,
    localTime: occurrence.localTime,
    originalScheduledAt: occurrence.originalScheduledAt,
    effectiveScheduledAt: occurrence.effectiveScheduledAt,
  }));
  const createdIds = new Set(createdItems.map((item) => item.id));
  const items = [
    ...current.items.filter((item) => !createdIds.has(item.id)),
    ...createdItems,
  ]
    .sort((left, right) =>
      left.effectiveScheduledAt === right.effectiveScheduledAt
        ? left.id.localeCompare(right.id)
        : left.effectiveScheduledAt.localeCompare(right.effectiveScheduledAt),
    )
    .slice(0, 50);
  return { ...current, items };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatLocalTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function fromLocalParts(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year!, month! - 1, day!, hour!, minute!);
}

function formatDisplayDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

function formatDisplayTime(date: Date, locale: string, format: '12-hour' | '24-hour') {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: format === '12-hour' }).format(date);
}

function formatOffset(minutes: number) {
  const sign = minutes >= 0 ? '+' : '-';
  const absolute = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function weekdayName(day: number) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]!;
}
