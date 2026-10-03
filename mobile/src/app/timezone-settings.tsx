import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { formErrorMessage } from '../auth/form-error';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/ToastProvider';
import { cn } from '../lib/cn';
import { useOnboarding } from '../onboarding/onboarding-context';
import { getTimeZoneOptions } from '../onboarding/device-preferences';
import {
  getNotificationPreferences,
  getProfilePreferences,
  updateNotificationPreferences,
  updateProfilePreferences,
} from '../preferences/preferences.api';
import { previewTimezoneChange } from '../reminders/reminder.api';
import { useAppTheme } from '../theme/theme-context';

export default function TimezoneSettingsScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { status } = useAuth();
  const { state, savePreferences } = useOnboarding();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(state.preferences.timezone);
  const [saving, setSaving] = useState(false);
  const options = useMemo(
    () =>
      getTimeZoneOptions(state.preferences.timezone)
        .filter((timezone) => timezone.toLowerCase().includes(search.trim().toLowerCase()))
        .slice(0, 80),
    [search, state.preferences.timezone],
  );
  const preview = useMutation({ mutationFn: previewTimezoneChange });

  if (status !== 'authenticated') return <Redirect href="/" />;

  async function review(timezone: string) {
    setSelected(timezone);
    try {
      await preview.mutateAsync(timezone);
    } catch (error) {
      showToast({
        title: 'Couldn’t preview the timezone change',
        message: formErrorMessage(error),
        tone: 'error',
      });
    }
  }

  async function confirm() {
    if (!preview.data || selected === state.preferences.timezone) return;
    setSaving(true);
    try {
      const [remote, notifications] = await Promise.all([
        getProfilePreferences(),
        getNotificationPreferences(),
      ]);
      await Promise.all([
        updateProfilePreferences({
          expectedRevision: remote.revision,
          locale: state.preferences.locale,
          timezone: selected,
          timeFormat: state.preferences.timeFormat === '12-hour' ? 'H12' : 'H24',
        }),
        updateNotificationPreferences({
          expectedRevision: notifications.revision,
          timezone: selected,
        }),
      ]);
      await savePreferences({ ...state.preferences, timezone: selected });
      showToast({
        title: 'Display timezone updated',
        message: 'Existing reminder schedules kept their original timezone and confirmed instants.',
        tone: 'success',
      });
      router.back();
    } catch (error) {
      showToast({
        title: 'Couldn’t save the timezone',
        message: formErrorMessage(error),
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="h-14 flex-row items-center justify-between px-3">
        <Pressable
          accessibilityLabel="Back to account"
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-full active:bg-secondary-fill"
          onPress={() => router.back()}
        >
          <Text className="text-[30px] font-inter text-foreground">‹</Text>
        </Pressable>
        <Text className="font-inter-semibold text-[13px] text-subtle-foreground">TIMEZONE</Text>
        <View className="size-11" />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="pb-12" keyboardShouldPersistTaps="handled">
        <View className="w-full max-w-[680px] self-center px-5">
          <Text accessibilityRole="header" className="mt-2 font-inter-bold text-[32px] leading-[38px] text-foreground">
            Change how times are displayed
          </Text>
          <Text className="font-inter mt-3 text-[15px] leading-6 text-muted-foreground">
            We preview the impact first. Existing schedules keep their own wall-clock timezone unless you edit them explicitly.
          </Text>

          <View className="mt-6 rounded-[16px] border border-taupe bg-paper px-4">
            <TextInput
              accessibilityLabel="Search timezones"
              className="min-h-[54px] text-[16px] text-foreground"
              onChangeText={setSearch}
              placeholder="Search city or timezone"
              placeholderTextColor={colors.muted}
              value={search}
            />
          </View>

          <View className="mt-3 max-h-[300px] overflow-hidden rounded-[16px] border border-taupe bg-paper">
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {options.map((timezone, index) => (
                <View key={timezone}>
                  {index > 0 ? <View className="ml-4 h-px bg-taupe/70" /> : null}
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: selected === timezone }}
                    className="min-h-[54px] flex-row items-center px-4 active:bg-canvas"
                    onPress={() => void review(timezone)}
                  >
                    <Text className="flex-1 text-[14px] font-inter-medium text-foreground">{timezone}</Text>
                    <View
                      className={cn(
                        'size-5 items-center justify-center rounded-full border',
                        selected === timezone ? 'border-ink' : 'border-taupe',
                      )}
                    >
                      {selected === timezone ? <View className="size-2.5 rounded-full bg-ink" /> : null}
                    </View>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>

          {preview.isPending ? (
            <View
              accessibilityLabel="Calculating schedule impact"
              accessibilityRole="progressbar"
              className="mt-5 rounded-[16px] bg-paper p-5"
            >
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-4 h-5 w-4/5" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </View>
          ) : preview.data ? (
            <View className="mt-5 rounded-[16px] bg-ink p-5">
              <Text className="font-inter-semibold text-[12px] text-white/55">IMPACT PREVIEW</Text>
              <Text className="mt-3 text-[18px] font-inter-semibold text-white">
                {preview.data.schedules.length === 0
                  ? 'No existing schedules are affected'
                  : `${preview.data.schedules.length} schedule${preview.data.schedules.length === 1 ? '' : 's'} reviewed`}
              </Text>
              <Text className="font-inter mt-2 text-[13px] leading-5 text-white/70">
                Schedule timezones and confirmed UTC instants will not be rewritten.
              </Text>
              {preview.data.schedules.slice(0, 4).map((schedule) => (
                <View key={schedule.scheduleId} className="mt-4 border-t border-white/15 pt-4">
                  <Text className="font-inter text-[13px] text-white/55">Next occurrence</Text>
                  <Text className="mt-1 text-[14px] font-inter-medium text-white">
                    {schedule.original.localDate} {schedule.original.localTime} · {schedule.original.timezone}
                  </Text>
                  <Text className="font-inter mt-1 text-[13px] text-white/70">
                    Displays as {schedule.displayInProposedTimezone.localDate} {schedule.displayInProposedTimezone.localTime}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View className="mt-6">
            <Button
              disabled={!preview.data || selected === state.preferences.timezone}
              label="Use this display timezone"
              loading={saving}
              onPress={() => void confirm()}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
