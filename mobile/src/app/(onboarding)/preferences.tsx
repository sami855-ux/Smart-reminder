import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../components/ui/Button';
import { Screen } from '../../components/ui/Screen';
import { cn } from '../../lib/cn';
import {
  formatPreferenceExample,
  getDeviceLocaleOptions,
  getTimeZoneOptions,
} from '../../onboarding/device-preferences';
import { useOnboarding } from '../../onboarding/onboarding-context';
import type { TimeFormat } from '../../onboarding/types';

export default function PreferencesScreen() {
  const router = useRouter();
  const { state, savePreferences } = useOnboarding();
  const [locale, setLocale] = useState(state.preferences.locale);
  const [timezone, setTimezone] = useState(state.preferences.timezone);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(
    state.preferences.timeFormat,
  );
  const [timezonePickerOpen, setTimezonePickerOpen] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const localeOptions = useMemo(() => getDeviceLocaleOptions(), []);
  const timezoneOptions = useMemo(
    () => getTimeZoneOptions(timezone),
    [timezone],
  );
  const filteredTimezones = useMemo(() => {
    const query = timezoneSearch.trim().toLocaleLowerCase();
    if (!query) return timezoneOptions;
    return timezoneOptions.filter((option) =>
      option.toLocaleLowerCase().includes(query),
    );
  }, [timezoneOptions, timezoneSearch]);

  const preferences = { locale, timezone, timeFormat };

  async function handleContinue() {
    setSaving(true);
    try {
      await savePreferences(preferences);
      router.push('/(onboarding)/notifications');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Screen
        description="We detected these from your device. Confirm them so dates and times appear exactly as you expect."
        eyebrow="Step 1 of 2"
        footer={
          <Button
            accessibilityHint="Saves these preferences and continues to notification setup"
            label="Confirm and continue"
            loading={saving}
            onPress={() => void handleContinue()}
          />
        }
        title="Set your local time"
      >
        <View className="overflow-hidden rounded-3xl border border-taupe bg-paper">
          <View className="p-5">
            <Text className="mb-3 font-medium text-[13px] text-muted-ink">
              Locale
            </Text>
            <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
              {localeOptions.map((option) => {
                const selected = option === locale;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    className={cn(
                      'min-h-11 justify-center rounded-xl border px-3.5 active:opacity-80',
                      selected
                        ? 'border-intelligence bg-intelligence'
                        : 'border-taupe bg-canvas',
                    )}
                    key={option}
                    onPress={() => setLocale(option)}
                  >
                    <Text
                      className={cn(
                        'font-medium text-[15px]',
                        selected ? 'text-white' : 'text-ink',
                      )}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="h-px bg-taupe/40" />

          <View className="p-5">
            <Text className="mb-3 font-medium text-[13px] text-muted-ink">
              Timezone
            </Text>
            <Pressable
              accessibilityHint="Opens a searchable list of IANA timezones"
              accessibilityRole="button"
              className="min-h-[64px] flex-row items-center rounded-2xl border border-taupe bg-canvas px-4 active:opacity-80"
              onPress={() => setTimezonePickerOpen(true)}
            >
              <View className="flex-1">
                <Text className="font-semibold text-[15px] text-ink">
                  {timezone}
                </Text>
                <Text className="mt-1 font-normal text-xs text-muted-ink">
                  IANA timezone
                </Text>
              </View>
              <Text aria-hidden className="font-normal text-3xl leading-8 text-intelligence">
                ›
              </Text>
            </Pressable>
          </View>

          <View className="h-px bg-taupe/40" />

          <View className="p-5">
            <Text className="mb-3 font-medium text-[13px] text-muted-ink">
              Time display
            </Text>
            <View
              accessibilityRole="radiogroup"
              className="flex-row rounded-2xl bg-canvas p-1"
            >
              {(['12-hour', '24-hour'] as const).map((option) => {
                const selected = option === timeFormat;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    className={cn(
                      'min-h-[46px] flex-1 items-center justify-center rounded-xl active:opacity-80',
                      selected && 'bg-intelligence',
                    )}
                    key={option}
                    onPress={() => setTimeFormat(option)}
                  >
                    <Text
                      className={cn(
                        'font-semibold text-[15px]',
                        selected ? 'text-white' : 'text-muted-ink',
                      )}
                    >
                      {option === '12-hour' ? '9:00 AM' : '09:00'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <View className="mt-4 rounded-2xl bg-intelligence-soft px-4 py-3.5">
          <Text className="font-semibold text-xs text-intelligence-dark">
            LIVE PREVIEW
          </Text>
          <Text className="mt-1.5 font-semibold text-[15px] leading-6 text-ink">
            {formatPreferenceExample(preferences)}
          </Text>
        </View>
      </Screen>

      <Modal
        animationType="slide"
        onRequestClose={() => setTimezonePickerOpen(false)}
        presentationStyle="pageSheet"
        visible={timezonePickerOpen}
      >
        <SafeAreaView className="flex-1 bg-canvas">
          <View className="flex-row items-center justify-between border-b border-taupe px-5 py-4">
            <View>
              <Text className="font-semibold text-[22px] text-ink">
                Choose timezone
              </Text>
              <Text className="mt-0.5 font-normal text-[13px] text-muted-ink">
                IANA timezone identifiers
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              className="min-h-11 justify-center px-2 active:opacity-70"
              onPress={() => setTimezonePickerOpen(false)}
            >
              <Text className="font-semibold text-base text-intelligence-dark">Done</Text>
            </Pressable>
          </View>
          <TextInput
            accessibilityLabel="Search timezones"
            autoCapitalize="none"
            autoCorrect={false}
            className="mx-4 my-4 min-h-[52px] rounded-2xl border border-taupe bg-paper px-4 font-normal text-base text-ink"
            onChangeText={setTimezoneSearch}
            placeholder="Search city or region"
            placeholderTextColor="#8E8E93"
            value={timezoneSearch}
          />
          <FlatList
            data={filteredTimezones}
            initialNumToRender={24}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item) => item}
            ListEmptyComponent={
              <View className="items-center px-6 py-12">
                <Text className="font-medium text-[15px] text-ink">
                  No timezone found
                </Text>
                <Pressable
                  accessibilityRole="button"
                  className="mt-3 min-h-11 justify-center active:opacity-70"
                  onPress={() => setTimezoneSearch('')}
                >
                  <Text className="font-semibold text-sm text-ink underline">
                    Clear search
                  </Text>
                </Pressable>
              </View>
            }
            renderItem={({ item }) => {
              const selected = item === timezone;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  className={cn(
                    'min-h-[56px] flex-row items-center justify-between border-b border-taupe px-5 active:opacity-80',
                    selected && 'bg-intelligence-soft',
                  )}
                  onPress={() => {
                    setTimezone(item);
                    setTimezonePickerOpen(false);
                    setTimezoneSearch('');
                  }}
                >
                  <Text
                    className={cn(
                      'flex-1 font-normal text-sm text-ink',
                      selected && 'font-semibold',
                    )}
                  >
                    {item.replaceAll('_', ' ')}
                  </Text>
                  {selected ? (
                    <View className="size-7 items-center justify-center rounded-full bg-intelligence">
                      <Text className="font-semibold text-sm text-white">✓</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}
