import type { PropsWithChildren, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type AuthScreenProps = PropsWithChildren<{
  title: string;
  description: string;
  footer?: ReactNode;
  onBack?: () => void;
}>;

export function AuthScreen({
  title,
  description,
  footer,
  onBack,
  children,
}: AuthScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full max-w-[480px] flex-1 self-center px-5 pb-7 pt-2">
            <View className="min-h-11 flex-row items-center">
              {onBack ? (
                <Pressable
                  accessibilityLabel="Go back"
                  accessibilityRole="button"
                  className="size-11 items-start justify-center active:opacity-60"
                  onPress={onBack}
                >
                  <Text className="text-[34px] font-normal leading-9 text-intelligence">‹</Text>
                </Pressable>
              ) : (
                <Text className="text-[15px] font-medium text-intelligence">
                  Smart Reminder
                </Text>
              )}
            </View>

            <View className="mt-10">
              <Text
                accessibilityRole="header"
                className="max-w-[420px] text-[34px] font-bold leading-[41px] text-ink"
              >
                {title}
              </Text>
              <Text className="mt-2 max-w-[420px] text-[17px] font-normal leading-6 text-muted-ink/80">
                {description}
              </Text>
            </View>

            <View className="mt-8">{children}</View>

            {footer ? (
              <View className="mt-auto pt-8">
                {footer}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
