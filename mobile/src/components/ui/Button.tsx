import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { cn } from '../../lib/cn';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'text';
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  accessibilityHint?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  accessibilityHint,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={cn(
        'min-h-[54px] items-center justify-center rounded-2xl px-6 active:opacity-75',
        variant === 'primary' && 'bg-intelligence',
        variant === 'secondary' && 'bg-secondary-fill',
        variant === 'text' && 'min-h-11 bg-transparent',
        isDisabled && 'opacity-50',
      )}
      disabled={isDisabled}
      onPress={onPress}
    >
      <View className="flex-row items-center gap-2.5">
        {loading ? (
          <ActivityIndicator
            color={variant === 'primary' ? '#FFFFFF' : '#20201E'}
          />
        ) : (
          icon
        )}
        <Text
          className={cn(
            'text-[17px] font-semibold',
            variant === 'primary'
              ? 'text-white'
              : variant === 'secondary'
                ? 'text-ink'
                : 'text-intelligence',
          )}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
