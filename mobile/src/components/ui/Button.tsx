import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { cn } from '../../lib/cn';
import { useAppTheme } from '../../theme/theme-context';
import { AuthIcon } from './AuthIcon';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'text';
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  accessibilityHint?: string;
  tone?: 'light' | 'auth';
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  accessibilityHint,
  tone = 'light',
}: ButtonProps) {
  const { colors } = useAppTheme();
  const isDisabled = disabled || loading;
  const isAuth = tone === 'auth';

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={cn(
        'min-h-[56px] items-center justify-center rounded-[14px] px-5 active:opacity-75',
        variant === 'primary' &&
          (isAuth ? 'bg-auth-accent' : 'bg-intelligence'),
        variant === 'secondary' &&
          (isAuth
            ? 'border border-auth-line bg-auth-surface'
            : 'bg-secondary-fill'),
        variant === 'text' && 'min-h-11 bg-transparent',
        isDisabled && 'opacity-50',
      )}
      disabled={isDisabled}
      onPress={onPress}
    >
      <View
        className={cn(
          'flex-row items-center gap-2.5',
          isAuth && variant === 'primary' && 'w-full justify-between',
        )}
      >
        <View className="flex-row items-center gap-2.5">
          {loading ? (
            <ActivityIndicator
              color={
                variant === 'primary'
                  ? isAuth
                    ? '#121510'
                    : '#FFFFFF'
                  : colors.foreground
              }
            />
          ) : (
            icon
          )}
          <Text
            className={cn(
              isAuth
                ? 'font-display-semibold text-[16px]'
                : 'text-[17px] font-inter-semibold',
              variant === 'primary'
                ? isAuth
                  ? 'text-auth-accent-ink'
                  : 'text-white'
                : variant === 'secondary'
                  ? isAuth
                    ? 'text-auth-ink'
                    : 'text-foreground'
                  : isAuth
                    ? 'text-auth-accent'
                    : 'text-accent',
            )}
          >
            {label}
          </Text>
        </View>
        {isAuth && variant === 'primary' && !loading ? (
          <AuthIcon color="#121510" name="arrow-right" size={21} />
        ) : null}
      </View>
    </Pressable>
  );
}
