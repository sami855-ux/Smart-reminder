import { useMemo, useRef, useState } from 'react';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
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
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { useToast } from '../components/ui/ToastProvider';
import { cn } from '../lib/cn';
import { useOnboarding } from '../onboarding/onboarding-context';
import { notificationPermissionAllowsAlerts } from '../platform/notifications/notification-permission';
import { scheduleReminderNotifications } from '../platform/notifications/reminder-notification-scheduler';
import {
  createIdempotencyKey,
  createReminder,
  getReminder,
  parseReminder,
  previewReminder,
  type ReminderContentInput,
} from '../reminders/reminder.api';
import type {
  ReminderPreview,
  ReminderScheduleInput,
} from '../reminders/reminder.schemas';

type CaptureMode = 'natural' | 'manual';
type PickerMode = 'date' | 'time' | 'end-date' | null;
type ScheduleType = ReminderScheduleInput['type'];
type EndMode = 'none' | 'count' | 'date';

const recurrenceOptions: { type: ScheduleType; label: string }[] = [
  { type: 'ONE_TIME', label: 'Once' },
  { type: 'DAILY', label: 'Daily' },
  { type: 'WEEKLY', label: 'Weekly' },
  { type: 'SELECTED_WEEKDAYS', label: 'Custom' },
];
const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function CreateReminderScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status } = useAuth();
  const { state } = useOnboarding();
  const { showToast } = useToast();
  const initialDate = useMemo(() => tomorrowAtNine(), []);
  const idempotencyKey = useRef(createIdempotencyKey('create'));
  const [captureMode, setCaptureMode] = useState<CaptureMode>('natural');
  const [naturalText, setNaturalText] = useState('');
  const [title, setTitle] = useState('');
  const [contextNote, setContextNote] = useState('');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('ONE_TIME');
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [endMode, setEndMode] = useState<EndMode>('none');
  const [occurrenceCount, setOccurrenceCount] = useState('');
  const [dateTime, setDateTime] = useState(initialDate);
  const [endDate, setEndDate] = useState(() => addDays(initialDate, 30));
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [preview, setPreview] = useState<ReminderPreview | null>(null);
  const [parserMessages, setParserMessages] = useState<string[]>([]);
  const [inferred, setInferred] = useState<Set<string>>(() => new Set());

  const previewMutation = useMutation({ mutationFn: previewReminder });
  const parseMutation = useMutation({ mutationFn: parseReminder });
  const createMutation = useMutation({
    mutationFn: async (input: ReminderContentInput & { confirmedResolvedAt: string }) => {
      const created = await createReminder(input, idempotencyKey.current);
      const detail = await getReminder(created.id);
      const scheduling = notificationPermissionAllowsAlerts(
        state.notificationPermission,
      )
        ? await scheduleReminderNotifications(detail)
        : { status: 'unavailable' as const, count: 0 as const };
      return { created, scheduling };
    },
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
      const result = await createMutation.mutateAsync({
        ...input,
        confirmedResolvedAt: preview.schedule.resolvedAt,
      });
      await queryClient.invalidateQueries({ queryKey: ['reminder-occurrences'] });
      showToast({
        title: 'Reminder created',
        message:
          result.scheduling.status === 'scheduled'
            ? `${result.scheduling.count} local notification${result.scheduling.count === 1 ? '' : 's'} scheduled.`
            : result.scheduling.status === 'unavailable'
              ? 'Saved to your account. Use a development build to schedule device alerts.'
              : 'Saved to your account, but device scheduling needs attention.',
        tone: result.scheduling.status === 'failed' ? 'info' : 'success',
        duration: 6500,
      });
      router.replace({
        pathname: '/reminders/[reminderId]',
        params: { reminderId: result.created.id },
      });
    } catch (error) {
      showToast({
        title: 'Couldn’t create the reminder',
        message: formErrorMessage(error),
        tone: 'error',
      });
    }
  }

  function handlePickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setPickerMode(null);
    if (event.type !== 'set' || !selected) return;
    if (pickerMode === 'end-date') {
      setEndDate(selected);
      invalidatePreview();
      return;
    }
    const next = new Date(dateTime);
    if (pickerMode === 'date') {
      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    } else {
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    }
    setDateTime(next);
    markEdited(pickerMode === 'date' ? 'date' : 'time');
    invalidatePreview();
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="h-14 flex-row items-center justify-between px-4">
          <Pressable
            accessibilityLabel="Close reminder creation"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full active:bg-secondary-fill"
            onPress={() => router.back()}
          >
            <Text className="text-[28px] font-light text-ink">×</Text>
          </Pressable>
          <Text className="text-[15px] font-semibold text-muted-ink">NEW REMINDER</Text>
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
              className="mt-2 text-[36px] font-bold leading-[42px] tracking-[-1px] text-ink"
            >
              What should stay on your radar?
            </Text>
            <Text className="mt-3 text-[16px] leading-6 text-muted-ink">
              Start naturally or set every detail yourself. Nothing is saved until you confirm.
            </Text>

            <SegmentedControl value={captureMode} onChange={setCaptureMode} />

            {captureMode === 'natural' ? (
              <View className="mt-5 rounded-[22px] border border-taupe bg-paper p-4">
                <Text className="mb-2 text-[13px] font-semibold text-muted-ink">
                  DESCRIBE IT
                </Text>
                <TextInput
                  accessibilityLabel="Natural language reminder"
                  className="min-h-[128px] text-[18px] leading-7 text-ink"
                  maxLength={2000}
                  multiline
                  onChangeText={setNaturalText}
                  placeholder="Tomorrow at 9, remind me to call John"
                  placeholderTextColor="#8B8B87"
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
                {parserMessages.length > 0 ? (
                  <View className="rounded-2xl bg-intelligence-soft p-4">
                    <Text className="text-[14px] font-semibold text-ink">Review the draft</Text>
                    {parserMessages.map((message) => (
                      <Text key={message} className="mt-1.5 text-[13px] leading-5 text-muted-ink">
                        • {message}
                      </Text>
                    ))}
                  </View>
                ) : null}

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

                <FormSection label="WHEN">
                  <DateTimeRow
                    label={inferred.has('date') ? 'Date · inferred' : 'Date'}
                    value={formatDisplayDate(dateTime, state.preferences.locale)}
                    onPress={() => setPickerMode('date')}
                  />
                  <Divider />
                  <DateTimeRow
                    label={inferred.has('time') ? 'Time · inferred' : 'Time'}
                    value={formatDisplayTime(
                      dateTime,
                      state.preferences.locale,
                      state.preferences.timeFormat,
                    )}
                    onPress={() => setPickerMode('time')}
                  />
                  <Divider />
                  <View className="px-4 py-3.5">
                    <Text className="text-[13px] font-medium text-subtle-ink">TIMEZONE</Text>
                    <Text className="mt-1 text-[15px] font-medium text-ink">
                      {state.preferences.timezone}
                    </Text>
                  </View>
                </FormSection>

                {pickerMode ? (
                  <View className="rounded-2xl bg-paper p-3">
                    <DateTimePicker
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      minimumDate={
                        pickerMode === 'end-date'
                          ? dateTime
                          : pickerMode === 'date'
                            ? new Date()
                            : undefined
                      }
                      mode={pickerMode === 'time' ? 'time' : 'date'}
                      onChange={handlePickerChange}
                      value={pickerMode === 'end-date' ? endDate : dateTime}
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

                <View>
                  <Text className="mb-2 text-[13px] font-semibold text-muted-ink">
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
                    <Text className="mb-2 text-[13px] font-semibold text-muted-ink">DAYS</Text>
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
                              'text-[14px] font-semibold',
                              selectedWeekdays.includes(day) ? 'text-white' : 'text-ink',
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
                    <Text className="text-[13px] font-semibold text-muted-ink">SERIES END</Text>
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
                          onPress={() => setPickerMode('end-date')}
                        />
                      </FormSection>
                    ) : null}
                  </View>
                ) : null}

                <Button
                  label="Review reminder"
                  loading={previewMutation.isPending}
                  onPress={() => void requestPreview()}
                  variant="secondary"
                />

                {preview ? (
                  <PreviewCard
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
            )}
          </View>
        </ScrollView>
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
    <View className="mt-7 flex-row rounded-2xl bg-secondary-fill p-1">
      {(['natural', 'manual'] as const).map((item) => (
        <Pressable
          key={item}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === item }}
          className={cn(
            'min-h-11 flex-1 items-center justify-center rounded-xl',
            value === item && 'bg-paper shadow-sm',
          )}
          onPress={() => onChange(item)}
        >
          <Text className={cn('text-[15px] font-semibold', value === item ? 'text-ink' : 'text-muted-ink')}>
            {item === 'natural' ? 'Quick capture' : 'Manual'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text className="mb-2 text-[13px] font-semibold text-muted-ink">{label}</Text>
      <View className="overflow-hidden rounded-[18px] border border-taupe bg-paper">{children}</View>
    </View>
  );
}

function DateTimeRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-[58px] flex-row items-center px-4 active:bg-canvas"
      onPress={onPress}
    >
      <Text className="flex-1 text-[16px] font-medium text-ink">{label}</Text>
      <Text className="text-[15px] font-medium text-muted-ink">{value}</Text>
      <Text className="ml-2 text-[22px] font-light text-subtle-ink">›</Text>
    </Pressable>
  );
}

function Divider() {
  return <View className="ml-4 h-px bg-taupe/70" />;
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
      <Text className={cn('text-[14px] font-semibold', selected ? 'text-white' : 'text-ink')}>
        {label}
      </Text>
    </Pressable>
  );
}

function PreviewCard({
  preview,
  locale,
  timeFormat,
}: {
  preview: ReminderPreview;
  locale: string;
  timeFormat: '12-hour' | '24-hour';
}) {
  const instant = new Date(preview.schedule.resolvedAt);
  return (
    <View className="rounded-[22px] bg-ink p-5">
      <Text className="text-[12px] font-semibold tracking-[1.2px] text-white/60">READY TO SAVE</Text>
      <Text className="mt-3 text-[22px] font-semibold leading-7 text-white">{preview.title}</Text>
      <Text className="mt-3 text-[15px] leading-6 text-white/75">
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
      </View>
      {preview.schedule.adjustments.map((adjustment) => (
        <Text key={adjustment.code} className="mt-4 text-[13px] leading-5 text-white/75">
          {adjustment.message}
        </Text>
      ))}
    </View>
  );
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-4">
      <Text className="w-24 text-[13px] text-white/50">{label}</Text>
      <Text className="flex-1 text-right text-[13px] font-medium text-white">{value}</Text>
    </View>
  );
}

function tomorrowAtNine() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
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
