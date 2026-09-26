import { BadRequestException } from '@nestjs/common';
import { ReminderScheduleTypeDto } from './dto/reminder-schedule.dto.js';
import { ReminderScheduleService } from './reminder-schedule.service.js';

describe('ReminderScheduleService', () => {
  const service = new ReminderScheduleService();
  const now = new Date('2026-09-26T07:00:00.000Z');

  it('resolves a one-time civil schedule and reports the UTC offset', () => {
    const result = service.resolve(
      {
        type: ReminderScheduleTypeDto.ONE_TIME,
        localDate: '2026-09-27',
        localTime: '09:00',
        timezone: 'Africa/Addis_Ababa',
      },
      now,
    );

    expect(result).toMatchObject({
      recurrenceSummary: 'Once on 2026-09-27',
      resolvedAt: '2026-09-27T06:00:00.000Z',
      utcOffsetMinutes: 180,
      firstOccurrence: { localDate: '2026-09-27', localTime: '09:00' },
    });
  });

  it('selects the first eligible weekday without altering the requested start date', () => {
    const result = service.resolve(
      {
        type: ReminderScheduleTypeDto.SELECTED_WEEKDAYS,
        localDate: '2026-09-27',
        localTime: '09:00',
        timezone: 'Africa/Addis_Ababa',
        weekdays: [1, 3, 5],
      },
      now,
    );

    expect(result.localDate).toBe('2026-09-27');
    expect(result.firstOccurrence.localDate).toBe('2026-09-28');
    expect(result.recurrenceSummary).toBe('Every Monday, Wednesday, Friday');
  });

  it('rejects a first occurrence in the past instead of silently advancing it', () => {
    expect(() =>
      service.resolve(
        {
          type: ReminderScheduleTypeDto.DAILY,
          localDate: '2026-09-25',
          localTime: '09:00',
          timezone: 'Africa/Addis_Ababa',
        },
        now,
      ),
    ).toThrow(BadRequestException);
  });

  it('moves a nonexistent DST time forward by the complete gap', () => {
    const result = service.resolve(
      {
        type: ReminderScheduleTypeDto.ONE_TIME,
        localDate: '2027-03-14',
        localTime: '02:30',
        timezone: 'America/New_York',
      },
      now,
    );

    expect(result.firstOccurrence).toMatchObject({
      localDate: '2027-03-14',
      localTime: '03:30',
      scheduledAt: '2027-03-14T07:30:00.000Z',
    });
    expect(result.adjustments[0]?.code).toBe('DST_GAP_MOVED_FORWARD');
  });

  it('uses the earlier offset for an ambiguous repeated local time', () => {
    const result = service.resolve(
      {
        type: ReminderScheduleTypeDto.ONE_TIME,
        localDate: '2026-11-01',
        localTime: '01:30',
        timezone: 'America/New_York',
      },
      now,
    );

    expect(result.resolvedAt).toBe('2026-11-01T05:30:00.000Z');
    expect(result.utcOffsetMinutes).toBe(-240);
  });

  it('rejects weekday values on non-selected recurrence types', () => {
    expect(() =>
      service.resolve(
        {
          type: ReminderScheduleTypeDto.WEEKLY,
          localDate: '2026-09-28',
          localTime: '09:00',
          timezone: 'Africa/Addis_Ababa',
          weekdays: [1],
        },
        now,
      ),
    ).toThrow('weekdays is allowed only for a selected-weekday schedule');
  });

  it('materializes daily occurrences at the same wall-clock time across DST', () => {
    const schedule = service.resolve(
      {
        type: ReminderScheduleTypeDto.DAILY,
        localDate: '2027-03-13',
        localTime: '09:00',
        timezone: 'America/New_York',
        occurrenceCount: 3,
      },
      now,
    );

    const occurrences = service.materialize(schedule);

    expect(occurrences).toEqual([
      expect.objectContaining({ localDate: '2027-03-13', localTime: '09:00', scheduledAt: '2027-03-13T14:00:00.000Z' }),
      expect.objectContaining({ localDate: '2027-03-14', localTime: '09:00', scheduledAt: '2027-03-14T13:00:00.000Z' }),
      expect.objectContaining({ localDate: '2027-03-15', localTime: '09:00', scheduledAt: '2027-03-15T13:00:00.000Z' }),
    ]);
  });

  it('honors an inclusive recurring end date', () => {
    const schedule = service.resolve(
      {
        type: ReminderScheduleTypeDto.DAILY,
        localDate: '2026-09-27',
        localTime: '09:00',
        timezone: 'Africa/Addis_Ababa',
        endDate: '2026-09-29',
      },
      now,
    );

    expect(service.materialize(schedule).map((item) => item.localDate)).toEqual([
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
    ]);
  });

  it('rejects simultaneous end-date and occurrence-count bounds', () => {
    expect(() =>
      service.resolve(
        {
          type: ReminderScheduleTypeDto.DAILY,
          localDate: '2026-09-27',
          localTime: '09:00',
          timezone: 'Africa/Addis_Ababa',
          endDate: '2026-10-01',
          occurrenceCount: 3,
        },
        now,
      ),
    ).toThrow('Use either endDate or occurrenceCount');
  });
});
