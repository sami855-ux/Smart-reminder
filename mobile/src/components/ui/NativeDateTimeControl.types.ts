export type NativeDateTimeControlProps = {
  mode: 'date' | 'time';
  value: Date;
  locale: string;
  timezone: string;
  timeFormat: '12-hour' | '24-hour';
  minimumDate?: Date;
  onChange: (value: Date) => void;
};
