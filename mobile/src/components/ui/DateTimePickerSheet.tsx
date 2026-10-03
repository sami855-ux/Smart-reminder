import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NativeDateTimeControl } from './NativeDateTimeControl';

export type DateTimePickerMode = 'date' | 'time';

export function DateTimePickerSheet({
  mode,
  value,
  locale,
  timezone,
  timeFormat,
  minimumDate,
  title,
  onChange,
  onCancel,
  onConfirm,
}: {
  mode: DateTimePickerMode;
  value: Date;
  locale: string;
  timezone: string;
  timeFormat: '12-hour' | '24-hour';
  minimumDate?: Date;
  title?: string;
  onChange: (value: Date) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isTime = mode === 'time';
  const selection = isTime
    ? new Intl.DateTimeFormat(locale, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: timeFormat === '12-hour',
      }).format(value)
    : new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(value);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onCancel}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible
    >
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityLabel="Close date and time picker"
          className="absolute inset-0"
          onPress={onCancel}
          style={{ backgroundColor: 'rgba(18, 21, 16, 0.42)' }}
        />
        <SafeAreaView
          accessibilityViewIsModal
          className="rounded-t-[28px] bg-canvas"
          edges={['bottom']}
        >
          <View className="items-center pb-1 pt-3">
            <View className="h-1.5 w-10 rounded-full bg-taupe" />
          </View>
          <View className="min-h-16 flex-row items-center justify-between px-5">
            <Pressable
              accessibilityRole="button"
              className="min-h-11 min-w-16 justify-center"
              onPress={onCancel}
            >
              <Text className="font-inter-medium text-[15px] text-muted-foreground">Cancel</Text>
            </Pressable>
            <View className="flex-1 items-center px-2">
              <Text className="font-inter-semibold text-[16px] text-foreground">
                {title ?? (isTime ? 'Choose time' : 'Choose date')}
              </Text>
              <Text className="mt-1 rounded-full bg-kast-lime px-2.5 py-1 font-inter-semibold text-[11px] text-ink">
                {selection}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              className="min-h-10 min-w-16 items-center justify-center rounded-full bg-ink px-3"
              onPress={onConfirm}
            >
              <Text className="font-inter-semibold text-[14px] text-white">Done</Text>
            </Pressable>
          </View>
          <View className="mx-4 mb-4 mt-2 bg-transparent px-2 py-1">
            <NativeDateTimeControl
              locale={locale}
              minimumDate={minimumDate}
              mode={mode}
              timeFormat={timeFormat}
              timezone={timezone}
              value={value}
              onChange={onChange}
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
