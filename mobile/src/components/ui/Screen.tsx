import type { PropsWithChildren, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ScreenProps = PropsWithChildren<{
  eyebrow?: string;
  title: string;
  description: string;
  footer?: ReactNode;
}>;

export function Screen({
  eyebrow,
  title,
  description,
  children,
  footer,
}: ScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-grow px-6 pb-6 pt-8">
            <View className="mb-7">
              {eyebrow ? (
                <Text className="mb-2 font-inter-medium text-[13px] uppercase text-muted-ink">
                  {eyebrow}
                </Text>
              ) : null}
              <Text
                accessibilityRole="header"
                className="font-inter-semibold text-[32px] leading-[38px] text-ink"
              >
                {title}
              </Text>
              <Text className="mt-3 font-inter text-base leading-6 text-muted-ink">
                {description}
              </Text>
            </View>
            {children}
          </View>
        </ScrollView>
        {footer ? (
          <View className="gap-2.5 border-t border-taupe/50 bg-canvas px-6 py-4">
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
