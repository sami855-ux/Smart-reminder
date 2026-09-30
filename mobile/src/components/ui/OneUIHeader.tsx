import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SymbolIcon } from './SymbolIcon';

export function OneUIHeader({
  title,
  subtitle,
  onBack,
  action,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  action?: ReactNode;
}) {
  return (
    <View className="px-5 pb-4 pt-1">
      <View className="min-h-12 flex-row items-center justify-between">
        {onBack ? (
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            className="size-12 items-center justify-center rounded-full active:bg-secondary-fill"
            hitSlop={8}
            onPress={onBack}
          >
            <SymbolIcon name="back" size={34} />
          </Pressable>
        ) : (
          <View className="size-12" />
        )}
        <View className="min-h-12 min-w-12 items-end justify-center">{action}</View>
      </View>
      <Text
        accessibilityRole="header"
        className="mt-5 text-[38px] font-bold leading-[44px] tracking-[-1.2px] text-ink"
      >
        {title}
      </Text>
      {subtitle ? (
        <Text className="mt-2 text-[15px] leading-6 text-muted-ink">{subtitle}</Text>
      ) : null}
    </View>
  );
}
