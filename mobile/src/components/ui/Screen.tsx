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
          <View className="w-full max-w-[560px] flex-grow self-center px-5 pb-8 pt-4">
            <View className="mb-7">
              {eyebrow ? (
                <Text className="mb-2 font-inter-medium text-[13px] text-accent">
                  {eyebrow}
                </Text>
              ) : null}
              <Text
                accessibilityRole="header"
                className="max-w-[460px] font-inter-bold text-[32px] leading-[38px] text-foreground"
              >
                {title}
              </Text>
              <Text className="mt-2 max-w-[500px] font-inter text-[15px] leading-6 text-muted-foreground">
                {description}
              </Text>
            </View>
            {children}
          </View>
        </ScrollView>
        {footer ? (
          <View className="border-t border-taupe bg-paper px-5 py-4">
            <View className="w-full max-w-[520px] gap-2.5 self-center">
              {footer}
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
