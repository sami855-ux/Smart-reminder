import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Text, type ColorValue } from 'react-native';

import { useAppTheme } from '../../theme/theme-context';

export type AuthIconName =
  | 'arrow-right'
  | 'back'
  | 'calendar'
  | 'check'
  | 'close'
  | 'clock'
  | 'eye'
  | 'eye-off'
  | 'key'
  | 'lock'
  | 'mail'
  | 'shield'
  | 'moon'
  | 'skip-forward'
  | 'snooze'
  | 'sun'
  | 'trash';

const symbols: Record<
  AuthIconName,
  {
    ios: SFSymbol;
    android: AndroidSymbol;
    fallback: string;
  }
> = {
  'arrow-right': {
    ios: 'arrow.right',
    android: 'arrow_forward',
    fallback: '→',
  },
  back: {
    ios: 'chevron.left',
    android: 'chevron_left',
    fallback: '‹',
  },
  calendar: {
    ios: 'calendar',
    android: 'calendar_today',
    fallback: '▦',
  },
  check: {
    ios: 'checkmark.circle',
    android: 'check_circle',
    fallback: '✓',
  },
  close: {
    ios: 'xmark',
    android: 'close',
    fallback: '×',
  },
  clock: {
    ios: 'clock',
    android: 'schedule',
    fallback: '◷',
  },
  eye: {
    ios: 'eye',
    android: 'visibility',
    fallback: '◉',
  },
  'eye-off': {
    ios: 'eye.slash',
    android: 'visibility_off',
    fallback: '⊘',
  },
  key: {
    ios: 'key',
    android: 'key',
    fallback: '◆',
  },
  lock: {
    ios: 'lock',
    android: 'lock',
    fallback: '●',
  },
  mail: {
    ios: 'envelope',
    android: 'mail',
    fallback: '@',
  },
  shield: {
    ios: 'lock.shield',
    android: 'shield',
    fallback: '◇',
  },
  moon: {
    ios: 'moon.fill',
    android: 'dark_mode',
    fallback: '☾',
  },
  'skip-forward': {
    ios: 'forward.end.fill',
    android: 'skip_next',
    fallback: '»',
  },
  snooze: {
    ios: 'alarm',
    android: 'snooze',
    fallback: '◷',
  },
  sun: {
    ios: 'sun.max.fill',
    android: 'light_mode',
    fallback: '☀',
  },
  trash: {
    ios: 'trash',
    android: 'delete',
    fallback: '×',
  },
};

export function AuthIcon({
  color,
  name,
  size = 20,
}: {
  color?: ColorValue;
  name: AuthIconName;
  size?: number;
}) {
  const { colors } = useAppTheme();
  const symbol = symbols[name];
  const tintColor = color ?? colors.accent;

  return (
    <SymbolView
      accessibilityElementsHidden
      fallback={
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ color: tintColor, fontSize: size, lineHeight: size }}
        >
          {symbol.fallback}
        </Text>
      }
      importantForAccessibility="no-hide-descendants"
      name={{
        android: symbol.android,
        ios: symbol.ios,
        web: symbol.android,
      }}
      size={size}
      style={{ height: size, width: size }}
      tintColor={tintColor}
    />
  );
}
