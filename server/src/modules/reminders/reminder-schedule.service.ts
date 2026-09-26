import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ReminderScheduleTypeDto,
  type ReminderScheduleDto,
} from './dto/reminder-schedule.dto.js';

export type ResolvedSchedule = {
  type: ReminderScheduleTypeDto;
  localDate: string;
  localTime: string;
  timezone: string;
  weekdays: number[];
  endDate: string | null;
  occurrenceCount: number | null;
  resolvedAt: string;
  utcOffsetMinutes: number;
  recurrenceSummary: string;
  firstOccurrence: {
    localDate: string;
    localTime: string;
    scheduledAt: string;
  };
  adjustments: Array<{
    code: 'DST_GAP_MOVED_FORWARD';
    message: string;
    requestedLocalDate: string;
    requestedLocalTime: string;
  }>;
};

export type MaterializedOccurrence = {
  sequence: number;
  localDate: string;
  localTime: string;
  scheduledAt: string;
  utcOffsetMinutes: number;
  dstAdjusted: boolean;
};

type LocalParts = {
  date: string;
  time: string;
  weekday: number;
};

const weekdayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

@Injectable()
export class ReminderScheduleService {
  resolve(schedule: ReminderScheduleDto, now = new Date()): ResolvedSchedule {
    this.assertValidTimezone(schedule.timezone);
    this.assertValidLocalDate(schedule.localDate);
    this.assertWeekdayContract(schedule);
    this.assertSeriesBounds(schedule);

    const weekdays = [...new Set((schedule.weekdays ?? []).map(Number))].sort(
      (left, right) => left - right,
    );
    const firstLocalDate =
      schedule.type === ReminderScheduleTypeDto.SELECTED_WEEKDAYS
        ? this.firstSelectedDate(schedule.localDate, weekdays)
        : schedule.localDate;
    const resolution = this.resolveLocalCivil(
      firstLocalDate,
      schedule.localTime,
      schedule.timezone,
    );

    if (resolution.instant.getTime() <= now.getTime()) {
      throw new BadRequestException(
        'The first occurrence is in the past. Choose a future date and time explicitly.',
      );
    }

    const adjustments: ResolvedSchedule['adjustments'] = resolution.adjusted
      ? [
          {
            code: 'DST_GAP_MOVED_FORWARD',
            message: `The requested local time does not exist in ${schedule.timezone} and was moved forward to ${resolution.localDate} ${resolution.localTime}.`,
            requestedLocalDate: firstLocalDate,
            requestedLocalTime: schedule.localTime,
          },
        ]
      : [];

    return {
      type: schedule.type,
      localDate: schedule.localDate,
      localTime: schedule.localTime,
      timezone: schedule.timezone,
      weekdays,
      endDate: schedule.endDate ?? null,
      occurrenceCount: schedule.occurrenceCount ?? null,
      resolvedAt: resolution.instant.toISOString(),
      utcOffsetMinutes: resolution.utcOffsetMinutes,
      recurrenceSummary: this.recurrenceSummary(schedule.type, firstLocalDate, weekdays),
      firstOccurrence: {
        localDate: resolution.localDate,
        localTime: resolution.localTime,
        scheduledAt: resolution.instant.toISOString(),
      },
      adjustments,
    };
  }

  materialize(
    schedule: ResolvedSchedule,
    options: {
      horizonDays?: number;
      maximum?: number;
      afterLocalDate?: string;
      sequenceStart?: number;
      allowEmpty?: boolean;
    } = {},
  ): MaterializedOccurrence[] {
    const maximum = Math.min(options.maximum ?? 128, 128);
    const horizonDays = Math.min(options.horizonDays ?? 90, 366);
    const sequenceStart = options.sequenceStart ?? 0;
    const remaining = schedule.occurrenceCount
      ? Math.max(schedule.occurrenceCount - sequenceStart, 0)
      : maximum;
    const limit = Math.min(remaining, maximum);
    const firstDate = schedule.firstOccurrence.localDate;
    const searchStart = options.afterLocalDate
      ? this.addLocalDays(options.afterLocalDate, 1)
      : firstDate;
    const horizonEnd = this.addLocalDays(searchStart, horizonDays);
    const weeklyDay = this.weekdayForDate(firstDate);
    const results: MaterializedOccurrence[] = [];

    for (let dayOffset = 0; dayOffset <= horizonDays && results.length < limit; dayOffset += 1) {
      const localDate = this.addLocalDays(searchStart, dayOffset);
      if (localDate > horizonEnd || (schedule.endDate && localDate > schedule.endDate)) break;
      const weekday = this.weekdayForDate(localDate);
      const eligible =
        schedule.type === ReminderScheduleTypeDto.ONE_TIME
          ? !options.afterLocalDate && dayOffset === 0
          : schedule.type === ReminderScheduleTypeDto.DAILY
            ? true
            : schedule.type === ReminderScheduleTypeDto.WEEKLY
              ? weekday === weeklyDay
              : schedule.weekdays.includes(weekday);
      if (!eligible) continue;

      const resolved = this.resolveLocalCivil(
        localDate,
        schedule.localTime,
        schedule.timezone,
      );
      results.push({
        sequence: sequenceStart + results.length + 1,
        localDate: resolved.localDate,
        localTime: resolved.localTime,
        scheduledAt: resolved.instant.toISOString(),
        utcOffsetMinutes: resolved.utcOffsetMinutes,
        dstAdjusted: resolved.adjusted,
      });
      if (schedule.type === ReminderScheduleTypeDto.ONE_TIME) break;
    }

    if (results.length === 0 && !options.allowEmpty) {
      throw new BadRequestException('The recurrence produces no occurrences in its active range.');
    }
    return results;
  }

  hasNextOccurrence(
    schedule: ResolvedSchedule,
    afterLocalDate: string,
    sequence: number,
  ): boolean {
    return (
      this.materialize(schedule, {
        afterLocalDate,
        sequenceStart: sequence,
        horizonDays: 8,
        maximum: 1,
        allowEmpty: true,
      }).length > 0
    );
  }

  localPartsAtInstant(instant: Date, timezone: string): LocalParts {
    this.assertValidTimezone(timezone);
    return this.partsAt(instant, timezone);
  }

  addLocalDays(date: string, days: number): string {
    const parsed = this.parseDate(date);
    return this.dateFromUtc(
      new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days)),
    );
  }

  weekdayForDate(date: string): number {
    const parsed = this.parseDate(date);
    return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
  }

  private resolveLocalCivil(date: string, time: string, timezone: string) {
    const requested = this.parseDateTime(date, time);
    const naiveEpoch = Date.UTC(
      requested.year,
      requested.month - 1,
      requested.day,
      requested.hour,
      requested.minute,
    );
    const offsets = this.offsetsNear(naiveEpoch, timezone);
    const exactMatches = this.candidatesForLocal(date, time, timezone, offsets);
    if (exactMatches?.length) {
      return this.resolutionFromMatches(exactMatches, date, time, false);
    }

    const possibleGaps = [...new Set(offsets.flatMap((left) =>
      offsets.map((right) => Math.abs(left - right)),
    ))]
      .filter((gap) => gap > 0 && gap <= 180)
      .sort((left, right) => left - right);
    for (const gapMinutes of possibleGaps) {
      const moved = this.localKeyAtNaiveEpoch(naiveEpoch + gapMinutes * 60_000);
      const matches = this.candidatesForLocal(
        moved.date,
        moved.time,
        timezone,
        offsets,
      );
      if (matches.length > 0) {
        return this.resolutionFromMatches(matches, moved.date, moved.time, true);
      }
    }

    throw new BadRequestException(
      `The local date and time could not be resolved in timezone ${timezone}.`,
    );
  }

  private offsetsNear(naiveEpoch: number, timezone: string): number[] {
    const offsets = new Set<number>();
    for (let hours = -48; hours <= 48; hours += 6) {
      const instant = new Date(naiveEpoch + hours * 60 * 60_000);
      const parts = this.partsAt(instant, timezone);
      offsets.add(
        Math.round(
          (naiveLocalEpoch(parts.date, parts.time) - instant.getTime()) / 60_000,
        ),
      );
    }
    return [...offsets];
  }

  private candidatesForLocal(
    date: string,
    time: string,
    timezone: string,
    offsets: number[],
  ): Date[] {
    const naiveEpoch = naiveLocalEpoch(date, time);
    return offsets
      .map((offset) => new Date(naiveEpoch - offset * 60_000))
      .filter((instant) => {
        const parts = this.partsAt(instant, timezone);
        return parts.date === date && parts.time === time;
      });
  }

  private resolutionFromMatches(
    matches: Date[],
    localDate: string,
    localTime: string,
    adjusted: boolean,
  ) {
    const instant = matches.reduce((earliest, candidate) =>
      candidate.getTime() < earliest.getTime() ? candidate : earliest,
    );
    const utcOffsetMinutes = Math.round(
      (naiveLocalEpoch(localDate, localTime) - instant.getTime()) / 60_000,
    );
    return { instant, localDate, localTime, utcOffsetMinutes, adjusted };
  }

  private localKeyAtNaiveEpoch(epoch: number) {
    const moved = new Date(epoch);
    const date = this.dateFromUtc(moved);
    const time = `${String(moved.getUTCHours()).padStart(2, '0')}:${String(
      moved.getUTCMinutes(),
    ).padStart(2, '0')}`;
    return { date, time, key: `${date}T${time}` };
  }

  private partsAt(instant: Date, timezone: string): LocalParts {
    const parts = new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instant);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const date = `${values['year']}-${values['month']}-${values['day']}`;
    const time = `${values['hour']}:${values['minute']}`;
    return { date, time, weekday: this.weekdayForDate(date) };
  }

  private firstSelectedDate(localDate: string, weekdays: number[]): string {
    for (let days = 0; days < 7; days += 1) {
      const candidate = this.addLocalDays(localDate, days);
      if (weekdays.includes(this.weekdayForDate(candidate))) return candidate;
    }
    throw new BadRequestException('At least one selected weekday is required.');
  }

  private recurrenceSummary(
    type: ReminderScheduleTypeDto,
    firstLocalDate: string,
    weekdays: number[],
  ): string {
    switch (type) {
      case ReminderScheduleTypeDto.ONE_TIME:
        return `Once on ${firstLocalDate}`;
      case ReminderScheduleTypeDto.DAILY:
        return 'Every day';
      case ReminderScheduleTypeDto.WEEKLY:
        return `Every ${weekdayNames[this.weekdayForDate(firstLocalDate)]}`;
      case ReminderScheduleTypeDto.SELECTED_WEEKDAYS:
        return `Every ${weekdays.map((day) => weekdayNames[day]).join(', ')}`;
    }
  }

  private assertWeekdayContract(schedule: ReminderScheduleDto): void {
    const weekdays = schedule.weekdays ?? [];
    if (
      schedule.type === ReminderScheduleTypeDto.SELECTED_WEEKDAYS &&
      weekdays.length === 0
    ) {
      throw new BadRequestException(
        'weekdays is required for a selected-weekday schedule.',
      );
    }
    if (
      schedule.type !== ReminderScheduleTypeDto.SELECTED_WEEKDAYS &&
      weekdays.length > 0
    ) {
      throw new BadRequestException(
        'weekdays is allowed only for a selected-weekday schedule.',
      );
    }
    if (new Set(weekdays).size !== weekdays.length) {
      throw new BadRequestException('weekdays must not contain duplicates.');
    }
  }

  private assertSeriesBounds(schedule: ReminderScheduleDto): void {
    if (schedule.endDate && schedule.occurrenceCount) {
      throw new BadRequestException('Use either endDate or occurrenceCount, not both.');
    }
    if (schedule.endDate) {
      this.assertValidLocalDate(schedule.endDate);
      if (schedule.endDate < schedule.localDate) {
        throw new BadRequestException('endDate must be on or after localDate.');
      }
    }
    if (
      schedule.type === ReminderScheduleTypeDto.ONE_TIME &&
      (schedule.endDate || schedule.occurrenceCount)
    ) {
      throw new BadRequestException(
        'endDate and occurrenceCount are allowed only for recurring schedules.',
      );
    }
  }

  private assertValidTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0);
    } catch {
      throw new BadRequestException('timezone must be a valid IANA timezone identifier.');
    }
  }

  private assertValidLocalDate(date: string): void {
    const parsed = this.parseDate(date);
    const normalized = this.dateFromUtc(
      new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)),
    );
    if (normalized !== date) {
      throw new BadRequestException('localDate must be a real calendar date.');
    }
  }

  private parseDate(date: string) {
    const [year, month, day] = date.split('-').map(Number);
    if (year === undefined || month === undefined || day === undefined) {
      throw new BadRequestException('localDate must use YYYY-MM-DD.');
    }
    return { year, month, day };
  }

  private parseDateTime(date: string, time: string) {
    const parsed = this.parseDate(date);
    const [hour, minute] = time.split(':').map(Number);
    if (hour === undefined || minute === undefined) {
      throw new BadRequestException('localTime must use 24-hour HH:mm.');
    }
    return { ...parsed, hour, minute };
  }

  private dateFromUtc(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
      date.getUTCDate(),
    ).padStart(2, '0')}`;
  }
}

function naiveLocalEpoch(date: string, time: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return Date.UTC(year!, month! - 1, day!, hour!, minute!);
}
