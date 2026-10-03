import { Pressable, Text, View } from 'react-native';

import type { NotificationPermissionState } from '../../onboarding/types';

type PermissionWarningProps = {
  state: NotificationPermissionState;
  onOpenSettings: () => void;
};

export function PermissionWarning({
  state,
  onOpenSettings,
}: PermissionWarningProps) {
  if (state === 'granted' || state === 'provisional') {
    return null;
  }

  return (
    <View
      accessibilityRole="alert"
      className="flex-row gap-3 rounded-lg border border-urgent/20 bg-urgent-soft p-4"
    >
      <View className="size-9 items-center justify-center rounded-lg bg-urgent">
        <Text className="font-inter-semibold text-base text-white">!</Text>
      </View>
      <View className="flex-1">
        <Text className="font-inter-semibold text-base text-foreground">
          Background alerts are off
        </Text>
        <Text className="mt-1 font-inter text-sm leading-5 text-muted-foreground">
          You can still use Smart Reminder. To receive alerts while the app is
          closed, allow notifications in your device settings.
        </Text>
        <Pressable
          accessibilityHint="Opens the Smart Reminder page in system settings"
          accessibilityRole="button"
          className="min-h-11 self-start justify-center active:opacity-70"
          onPress={onOpenSettings}
        >
          <Text className="font-inter-semibold text-sm text-urgent">
            Open system settings
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
