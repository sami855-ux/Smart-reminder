import { Pressable, View } from 'react-native';

import { cn } from '../../lib/cn';

export function AppleSwitch({
  value,
  disabled = false,
  label,
  onValueChange,
}: {
  value: boolean;
  disabled?: boolean;
  label: string;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      className={cn(
        'h-[32px] w-[52px] justify-center rounded-full p-[3px]',
        value ? 'bg-kast-lime' : 'bg-taupe',
        disabled && 'opacity-50',
      )}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onValueChange(!value)}
    >
      <View
        className={cn(
          'size-[26px] rounded-full bg-white',
          value ? 'self-end' : 'self-start',
        )}
        style={{
          elevation: 2,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.2,
          shadowRadius: 2,
        }}
      />
    </Pressable>
  );
}
