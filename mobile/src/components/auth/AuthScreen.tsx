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
import { StatusBar } from 'expo-status-bar';

import { AuthIcon } from '../ui/AuthIcon';
import { useAppTheme } from '../../theme/theme-context';

type AuthScreenProps = PropsWithChildren<{
  title: string;
  description: string;
  footer?: ReactNode;
  onBack?: () => void;
  appearance?: 'default' | 'auth';
}>;

export function AuthScreen({
  title,
  description,
  footer,
  onBack,
  appearance = 'default',
  children,
}: AuthScreenProps) {
  const { colors, isDark } = useAppTheme();
  const isAuth = appearance === 'auth';

  if (isAuth) {
    return (
      <View className="flex-1 bg-auth-canvas">
        <StatusBar style={isDark ? 'light' : 'dark'} />
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
            <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
              <View className="w-full max-w-[480px] flex-1 self-center px-6 pb-5 pt-3">
                {onBack ? (
                  <View className="min-h-12 flex-row items-center">
                    <Pressable
                      accessibilityLabel="Go back"
                      accessibilityRole="button"
                      className="size-12 items-start justify-center active:opacity-60"
                      hitSlop={8}
                      onPress={onBack}
                    >
                      <AuthIcon color={colors.foreground} name="back" size={25} />
                    </Pressable>
                  </View>
                ) : null}

                <View className={onBack ? 'mt-8' : 'mt-10'}>
                  <Text
                    accessibilityRole="header"
                    className="max-w-[420px] font-display-bold text-[34px] leading-[40px] text-auth-ink"
                  >
                    {title}
                  </Text>
                  <Text className="mt-3 max-w-[420px] font-inter text-[15px] leading-6 text-auth-muted">
                    {description}
                  </Text>
                </View>

                <View className="mt-9">{children}</View>
                {footer ? (
                  <View className="mt-auto pt-9">{footer}</View>
                ) : null}
              </View>
            </SafeAreaView>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

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
          <View className="w-full max-w-[480px] flex-1 self-center px-6 pb-7 pt-3">
            {onBack ? (
              <View className="min-h-12 flex-row items-center">
                <Pressable
                  accessibilityLabel="Go back"
                  accessibilityRole="button"
                  className="size-12 items-start justify-center active:opacity-60"
                  onPress={onBack}
                >
                  <Text className="text-[34px] font-normal leading-9 text-accent">
                    ‹
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View className={onBack ? 'mt-8' : 'mt-10'}>
              <Text
                accessibilityRole="header"
                className="max-w-[420px] text-[34px] font-bold leading-[41px] text-foreground"
              >
                {title}
              </Text>
              <Text
                className="mt-3 max-w-[420px] text-[16px] font-normal leading-6 text-muted-foreground/80"
              >
                {description}
              </Text>
            </View>

            <View className="mt-8">{children}</View>

            {footer ? (
              <View className="mt-auto pt-9">{footer}</View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
