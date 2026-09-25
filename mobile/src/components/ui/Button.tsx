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
        'min-h-[54px] items-center justify-center rounded-2xl px-5 active:opacity-70',
        variant === 'primary' && 'bg-ink',
        variant === 'secondary' && 'border border-taupe bg-paper',
        variant === 'text' && 'min-h-[46px] bg-transparent',
        isDisabled && 'opacity-50',
      )}
      disabled={isDisabled}
      onPress={onPress}
    >
      <View className="flex-row items-center gap-2.5">
        {loading ? (
          <ActivityIndicator
            color={variant === 'primary' ? '#FFFFFF' : '#1C1D21'}
          />
        ) : (
          icon
        )}
        <Text
          className={cn(
            'font-inter-semibold text-base',
            variant === 'primary' ? 'text-white' : 'text-ink',
          )}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
