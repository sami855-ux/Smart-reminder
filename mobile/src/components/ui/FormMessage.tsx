import { Text, View } from 'react-native';

import { cn } from '../../lib/cn';

type FormMessageProps = {
  message: string | null;
  tone?: 'error' | 'success' | 'neutral';
};

export function FormMessage({ message, tone = 'error' }: FormMessageProps) {
  if (!message) return null;

  const borderClass =
    tone === 'success'
      ? 'border-success'
      : tone === 'error'
        ? 'border-urgent'
        : 'border-ink';

  return (
    <View
      accessibilityRole="alert"
      className={cn('border-l-2 bg-paper px-4 py-3', borderClass)}
    >
      <Text className="font-inter text-sm leading-5 text-ink">{message}</Text>
    </View>
  );
}
