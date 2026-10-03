import { DateTimePicker, Host } from '@expo/ui/jetpack-compose';

import type { NativeDateTimeControlProps } from './NativeDateTimeControl.types';
import { useAppTheme } from '../../theme/theme-context';

export function NativeDateTimeControl({
  mode,
  value,
  timeFormat,
  minimumDate,
  onChange,
}: NativeDateTimeControlProps) {
  const { colors, isDark } = useAppTheme();
  const secondaryFill = isDark ? '#2A2E28' : '#E7E9E2';
  const dateColors = {
    containerColor: '#00000000',
    titleContentColor: colors.muted,
    headlineContentColor: colors.foreground,
    weekdayContentColor: colors.muted,
    subheadContentColor: colors.foreground,
    navigationContentColor: colors.foreground,
    yearContentColor: colors.foreground,
    disabledYearContentColor: colors.muted,
    currentYearContentColor: colors.accent,
    selectedYearContentColor: '#121510',
    disabledSelectedYearContentColor: colors.muted,
    selectedYearContainerColor: '#B8F34A',
    disabledSelectedYearContainerColor: secondaryFill,
    dayContentColor: colors.foreground,
    disabledDayContentColor: colors.muted,
    selectedDayContentColor: '#121510',
    disabledSelectedDayContentColor: colors.muted,
    selectedDayContainerColor: '#B8F34A',
    disabledSelectedDayContainerColor: secondaryFill,
    todayContentColor: colors.accent,
    todayDateBorderColor: colors.accent,
    dayInSelectionRangeContentColor: colors.foreground,
    dayInSelectionRangeContainerColor: isDark ? '#283418' : '#EEF5DA',
    dividerColor: secondaryFill,
  } as const;
  const timeColors = {
    containerColor: '#00000000',
    clockDialColor: '#00000000',
    clockDialSelectedContentColor: '#121510',
    clockDialUnselectedContentColor: colors.foreground,
    selectorColor: '#B8F34A',
    periodSelectorBorderColor: isDark ? '#41463E' : '#D9DDD2',
    periodSelectorSelectedContainerColor: '#B8F34A',
    periodSelectorUnselectedContainerColor: '#00000000',
    periodSelectorSelectedContentColor: '#121510',
    periodSelectorUnselectedContentColor: colors.muted,
    timeSelectorSelectedContainerColor: '#B8F34A',
    timeSelectorUnselectedContainerColor: secondaryFill,
    timeSelectorSelectedContentColor: '#121510',
    timeSelectorUnselectedContentColor: colors.foreground,
  } as const;

  return (
    <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
      <DateTimePicker
        displayedComponents={mode === 'time' ? 'hourAndMinute' : 'date'}
        elementColors={mode === 'time' ? timeColors : dateColors}
        initialDate={value.toISOString()}
        is24Hour={timeFormat === '24-hour'}
        selectableDates={minimumDate ? { start: minimumDate } : undefined}
        showVariantToggle={false}
        variant="picker"
        onDateSelected={onChange}
      />
    </Host>
  );
}
