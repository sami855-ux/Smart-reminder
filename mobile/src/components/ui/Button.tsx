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
        'min-h-[52px] items-center justify-center rounded-full px-6 active:opacity-65',
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
            color={variant === 'primary' ? '#FFFFFF' : '#007AFF'}
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
                ? 'text-intelligence-dark'
                : 'text-intelligence',
          )}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
