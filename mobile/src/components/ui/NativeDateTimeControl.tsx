import { DateTimePicker } from '@expo/ui/community/datetime-picker';

import type { NativeDateTimeControlProps } from './NativeDateTimeControl.types';
import { useAppTheme } from '../../theme/theme-context';

export function NativeDateTimeControl({
  mode,
  value,
  locale,
  timezone,
  timeFormat,
  minimumDate,
  onChange,
}: NativeDateTimeControlProps) {
  const { colors, mode: themeMode } = useAppTheme();
  return (
    <DateTimePicker
      accentColor={colors.accent}
      display={mode === 'time' ? 'spinner' : 'inline'}
      is24Hour={timeFormat === '24-hour'}
      locale={locale}
      minimumDate={minimumDate}
      mode={mode}
      presentation="inline"
      style={{ width: '100%', backgroundColor: 'transparent' }}
      themeVariant={themeMode}
      timeZoneName={timezone}
      value={value}
      onValueChange={(_, selected) => onChange(selected)}
    />
  );
}
