import { getCalendars, getLocales } from 'expo-localization';

import type { OnboardingPreferences } from './types';

const DEFAULT_LOCALE = 'en-US';
const DEFAULT_TIMEZONE = 'UTC';

export function getDevicePreferences(): OnboardingPreferences {
  const locale = getLocales()[0];
  const calendar = getCalendars()[0];

  return {
    locale: locale?.languageTag || DEFAULT_LOCALE,
    timezone: calendar?.timeZone || DEFAULT_TIMEZONE,
    timeFormat: calendar?.uses24hourClock ? '24-hour' : '12-hour',
  };
}

export function getDeviceLocaleOptions(): string[] {
  return Array.from(
    new Set(getLocales().map((locale) => locale.languageTag).filter(Boolean)),
  );
}

export function getTimeZoneOptions(currentTimezone: string): string[] {
  const supportedValuesOf = (
    Intl as typeof Intl & {
      supportedValuesOf?: (key: 'timeZone') => string[];
    }
  ).supportedValuesOf;

  const supported = supportedValuesOf?.('timeZone') ?? [currentTimezone, 'UTC'];
  return Array.from(new Set([currentTimezone, ...supported])).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function formatPreferenceExample({
  locale,
  timezone,
  timeFormat,
}: OnboardingPreferences): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: timeFormat === '12-hour',
      timeZone: timezone,
      timeZoneName: 'short',
    }).format(new Date());
  } catch {
    return `${timezone} · ${timeFormat}`;
  }
}
