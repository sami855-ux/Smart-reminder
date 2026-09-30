import { Text, type TextStyle } from 'react-native';

import { cn } from '../../lib/cn';

export type SymbolName =
  | 'add'
  | 'back'
  | 'calendar'
  | 'check'
  | 'chevron'
  | 'clock'
  | 'completed'
  | 'delete'
  | 'edit'
  | 'history'
  | 'more'
  | 'notification'
  | 'overdue'
  | 'person'
  | 'repeat'
  | 'scheduled'
  | 'settings'
  | 'sparkle'
  | 'today';

const symbols: Record<SymbolName, string> = {
  add: '+',
  back: '‹',
  calendar: '▦',
  check: '✓',
  chevron: '›',
  clock: '◷',
  completed: '✓',
  delete: '×',
  edit: '✎',
  history: '↺',
  more: '•••',
  notification: '●',
  overdue: '!',
  person: '●',
  repeat: '↻',
  scheduled: '◷',
  settings: '⚙',
  sparkle: '✦',
  today: '•',
};

export function SymbolIcon({
  name,
  size = 22,
  className,
}: {
  name: SymbolName;
  size?: number;
  className?: string;
}) {
  const style: TextStyle = {
    fontSize: size,
    lineHeight: Math.ceil(size * 1.12),
    textAlign: 'center',
  };

  return (
    <Text
      accessibilityElementsHidden
      className={cn('font-semibold text-ink', className)}
      importantForAccessibility="no-hide-descendants"
      style={style}
    >
      {symbols[name]}
    </Text>
  );
}
