import type { PrismaService } from '../../database/prisma.service.js';
import { ReminderScheduleTypeDto } from './dto/reminder-schedule.dto.js';
import { RecurringEditScopeDto } from './dto/reminder-time.dto.js';
import { ReminderScheduleService } from './reminder-schedule.service.js';
import { ReminderTimeService } from './reminder-time.service.js';

describe('ReminderTimeService', () => {
  const userId = '10000000-0000-4000-8000-000000000001';
  const sessionId = '20000000-0000-4000-8000-000000000001';
  const reminderId = '30000000-0000-4000-8000-000000000001';
  const scheduleId = '40000000-0000-4000-8000-000000000001';
  const occurrenceId = '50000000-0000-4000-8000-000000000001';
  const now = new Date('2026-09-26T07:00:00.000Z');

  it('previews a timezone change without rewriting schedule identity or its instant', async () => {
    const prisma = {
      schedule: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: scheduleId,
            reminderId,
            revision: 1,
            localStartDate: '2026-09-27',
            localStartTime: '09:00',
            timezone: 'Africa/Addis_Ababa',
            resolvedStartAt: new Date('2026-09-27T06:00:00.000Z'),
            resolvedUtcOffsetMin: 180,
            reminder: { id: reminderId, revision: 1 },
            occurrences: [
              { effectiveScheduledAt: new Date('2026-09-27T06:00:00.000Z') },
            ],
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new ReminderTimeService(prisma, new ReminderScheduleService());

    const result = await service.previewTimezoneChange(userId, 'America/New_York');

    expect(result).toMatchObject({
      persisted: false,
      policy: 'PRESERVE_SCHEDULE_TIMEZONE',
      schedules: [
        {
          original: {
            timezone: 'Africa/Addis_Ababa',
            resolvedAt: '2026-09-27T06:00:00.000Z',
          },
          displayInProposedTimezone: {
            localDate: '2026-09-27',
            localTime: '02:00',
            timezone: 'America/New_York',
          },
          scheduleTimezoneChanges: false,
          confirmedInstantChanges: false,
        },
      ],
    });
  });

  it('creates a new revision for the selected and all future occurrences', async () => {
    const tx = {
      reminder: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      reminderOccurrence: { updateMany: vi.fn().mockResolvedValue({ count: 4 }), createMany: vi.fn() },
      schedule: {
        update: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: '40000000-0000-4000-8000-000000000002' }),
      },
      reminderEvent: { create: vi.fn().mockResolvedValue({ id: 'event-revision' }) },
    };
    const selectedAt = new Date('2026-09-28T06:00:00.000Z');
    const prisma = {
      reminderEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      reminder: {
        findFirst: vi.fn().mockResolvedValue({
          id: reminderId,
          revision: 1,
          schedules: [{ id: scheduleId, type: 'DAILY', revision: 1 }],
          occurrences: [
            {
              id: occurrenceId,
              scheduleId,
              scheduleRevision: 1,
              sequence: 2,
              lifecycle: 'SCHEDULED',
              originalScheduledAt: selectedAt,
              effectiveScheduledAt: selectedAt,
            },
          ],
        }),
      },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    } as unknown as PrismaService;
    const service = new ReminderTimeService(prisma, new ReminderScheduleService());

    const result = await service.editSchedule(
      { userId, sessionId },
      reminderId,
      'schedule-edit-0001',
      {
        occurrenceId,
        scope: RecurringEditScopeDto.THIS_AND_FUTURE,
        expectedReminderRevision: 1,
        expectedEffectiveScheduledAt: selectedAt.toISOString(),
        schedule: {
          type: ReminderScheduleTypeDto.DAILY,
          localDate: '2026-09-28',
          localTime: '10:00',
          timezone: 'Africa/Addis_Ababa',
          occurrenceCount: 2,
        },
      },
      now,
    );

    expect(tx.reminderOccurrence.updateMany).toHaveBeenCalledWith({
      where: { scheduleId, sequence: { gte: 2 }, lifecycle: 'SCHEDULED' },
      data: { lifecycle: 'CANCELLED', cancelledAt: now },
    });
    expect(tx.schedule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        revision: 2,
        supersededScheduleId: scheduleId,
        localStartTime: '10:00',
      }),
    });
    expect(tx.reminderOccurrence.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ scheduleRevision: 2, sequence: 1 }),
        expect.objectContaining({ scheduleRevision: 2, sequence: 2 }),
      ]),
    });
    expect(result).toMatchObject({
      reminderRevision: 2,
      scheduleRevision: 2,
      preservedHistoricalOccurrences: 1,
      cancelledFutureOccurrences: 4,
      materializedOccurrenceCount: 2,
    });
  });

  it('reschedules only the selected occurrence without revising the series', async () => {
    const selectedAt = new Date('2026-09-28T06:00:00.000Z');
    const tx = {
      reminderOccurrence: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      reminderEvent: { create: vi.fn().mockResolvedValue({ id: 'event-occurrence' }) },
      schedule: { create: vi.fn() },
      reminder: { updateMany: vi.fn() },
    };
    const prisma = {
      reminderEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      reminder: {
        findFirst: vi.fn().mockResolvedValue({
          id: reminderId,
          revision: 1,
          schedules: [{ id: scheduleId, type: 'DAILY', revision: 1 }],
          occurrences: [
            {
              id: occurrenceId,
              scheduleId,
              scheduleRevision: 1,
              sequence: 2,
              lifecycle: 'SCHEDULED',
              originalScheduledAt: selectedAt,
              effectiveScheduledAt: selectedAt,
            },
          ],
        }),
      },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    } as unknown as PrismaService;
    const service = new ReminderTimeService(prisma, new ReminderScheduleService());

    const result = await service.editSchedule(
      { userId, sessionId },
      reminderId,
      'occurrence-edit-0001',
      {
        occurrenceId,
        scope: RecurringEditScopeDto.THIS_OCCURRENCE,
        expectedReminderRevision: 1,
        expectedEffectiveScheduledAt: selectedAt.toISOString(),
        schedule: {
          type: ReminderScheduleTypeDto.ONE_TIME,
          localDate: '2026-09-29',
          localTime: '10:00',
          timezone: 'Africa/Addis_Ababa',
        },
      },
      now,
    );

    expect(tx.reminderOccurrence.updateMany).toHaveBeenCalledWith({
      where: {
        id: occurrenceId,
        lifecycle: 'SCHEDULED',
        effectiveScheduledAt: selectedAt,
      },
      data: {
        effectiveScheduledAt: new Date('2026-09-29T07:00:00.000Z'),
        localDate: '2026-09-29',
        localTime: '10:00',
      },
    });
    expect(tx.schedule.create).not.toHaveBeenCalled();
    expect(tx.reminder.updateMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      reminderRevision: 1,
      scope: 'THIS_OCCURRENCE',
      scheduleRevision: 1,
      originalScheduledAt: selectedAt.toISOString(),
      effectiveScheduledAt: '2026-09-29T07:00:00.000Z',
      laterOccurrencesChanged: false,
    });
  });

  it('idempotently extends a finite recurring occurrence horizon', async () => {
    const firstInstant = new Date('2026-09-27T06:00:00.000Z');
    const tx = {
      reminderOccurrence: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
      schedule: { update: vi.fn() },
    };
    const prisma = {
      schedule: {
        findFirst: vi.fn().mockResolvedValue({
          id: scheduleId,
          reminderId,
          type: 'DAILY',
          localStartDate: '2026-09-27',
          localStartTime: '09:00',
          timezone: 'Africa/Addis_Ababa',
          recurrenceWeekdays: [],
          endLocalDate: null,
          occurrenceCount: 3,
          resolvedStartAt: firstInstant,
          resolvedUtcOffsetMin: 180,
          revision: 1,
          materializedThrough: firstInstant,
          occurrences: [
            {
              sequence: 1,
              localDate: '2026-09-27',
              localTime: '09:00',
              originalScheduledAt: firstInstant,
            },
          ],
        }),
      },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    } as unknown as PrismaService;
    const service = new ReminderTimeService(prisma, new ReminderScheduleService());

    const result = await service.materializeCurrentHorizon(userId, reminderId);

    expect(tx.reminderOccurrence.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ sequence: 2, localDate: '2026-09-28' }),
        expect.objectContaining({ sequence: 3, localDate: '2026-09-29' }),
      ]),
      skipDuplicates: true,
    });
    expect(tx.schedule.update).toHaveBeenCalledWith({
      where: { id: scheduleId },
      data: {
        materializedThrough: new Date('2026-09-29T06:00:00.000Z'),
        nextEvaluationAt: null,
      },
    });
    expect(result.createdOccurrenceCount).toBe(2);
  });

  it('snoozes only the selected occurrence and preserves its original instant', async () => {
    const original = new Date('2026-09-27T06:00:00.000Z');
    const until = new Date('2026-09-27T06:30:00.000Z');
    const tx = {
      reminderOccurrence: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      reminderEvent: { create: vi.fn().mockResolvedValue({ id: 'event-snooze' }) },
    };
    const prisma = {
      reminderEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      reminderOccurrence: {
        findFirst: vi.fn().mockResolvedValue({
          id: occurrenceId,
          scheduleId,
          scheduleRevision: 1,
          lifecycle: 'SCHEDULED',
          originalScheduledAt: original,
          effectiveScheduledAt: original,
          reminder: { id: reminderId },
        }),
      },
      schedule: { findUnique: vi.fn().mockResolvedValue({ timezone: 'Africa/Addis_Ababa' }) },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    } as unknown as PrismaService;
    const service = new ReminderTimeService(prisma, new ReminderScheduleService());

    const result = await service.snooze(
      { userId, sessionId },
      occurrenceId,
      'snooze-occurrence-0001',
      {
        until: until.toISOString(),
        expectedScheduleRevision: 1,
        expectedEffectiveScheduledAt: original.toISOString(),
      },
      new Date('2026-09-27T06:20:00.000Z'),
    );

    expect(tx.reminderOccurrence.updateMany).toHaveBeenCalledWith({
      where: {
        id: occurrenceId,
        lifecycle: 'SCHEDULED',
        scheduleRevision: 1,
        effectiveScheduledAt: original,
      },
      data: {
        effectiveScheduledAt: until,
        localDate: '2026-09-27',
        localTime: '09:30',
      },
    });
    expect(result).toMatchObject({
      originalScheduledAt: original.toISOString(),
      effectiveScheduledAt: until.toISOString(),
      laterOccurrencesChanged: false,
    });
  });
});
