import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../database/prisma.service.js';
import { ReminderScheduleTypeDto } from './dto/reminder-schedule.dto.js';
import { ReminderScheduleService } from './reminder-schedule.service.js';
import { RemindersService } from './reminders.service.js';

describe('RemindersService idempotent creation', () => {
  const userId = '10000000-0000-4000-8000-000000000001';
  const sessionId = '20000000-0000-4000-8000-000000000001';
  const key = 'create-reminder-0001';
  const now = new Date('2026-09-26T07:00:00.000Z');
  const dto = {
    title: 'Call John',
    contextNote: 'Discuss the revised proposal.',
    confirmed: true as const,
    confirmedResolvedAt: '2026-09-27T06:00:00.000Z',
    schedule: {
      type: ReminderScheduleTypeDto.ONE_TIME,
      localDate: '2026-09-27',
      localTime: '09:00',
      timezone: 'Africa/Addis_Ababa',
    },
  };

  function reminderRecord() {
    return {
      id: '30000000-0000-4000-8000-000000000001',
      userId,
      title: dto.title,
      contextNote: dto.contextNote,
      lifecycle: 'ACTIVE' as const,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      schedules: [
        {
          id: '40000000-0000-4000-8000-000000000001',
          reminderId: '30000000-0000-4000-8000-000000000001',
          type: 'ONE_TIME' as const,
          localStartDate: '2026-09-27',
          localStartTime: '09:00',
          timezone: 'Africa/Addis_Ababa',
          recurrenceWeekdays: [],
          endLocalDate: null,
          occurrenceCount: null,
          resolvedStartAt: new Date('2026-09-27T06:00:00.000Z'),
          resolvedUtcOffsetMin: 180,
          revision: 1,
          materializedThrough: new Date('2026-09-27T06:00:00.000Z'),
          nextEvaluationAt: new Date('2026-09-27T06:00:00.000Z'),
          supersededScheduleId: null,
          createdAt: now,
        },
      ],
      occurrences: [
        {
          id: '50000000-0000-4000-8000-000000000001',
          reminderId: '30000000-0000-4000-8000-000000000001',
          scheduleId: '40000000-0000-4000-8000-000000000001',
          scheduleRevision: 1,
          sequence: 1,
          occurrenceKey: '2026-09-27T09:00[Africa/Addis_Ababa]#1',
          originalScheduledAt: new Date('2026-09-27T06:00:00.000Z'),
          effectiveScheduledAt: new Date('2026-09-27T06:00:00.000Z'),
          localDate: '2026-09-27',
          localTime: '09:00',
          lifecycle: 'SCHEDULED' as const,
          completedAt: null,
          skippedAt: null,
          cancelledAt: null,
          createdAt: now,
        },
      ],
    };
  }

  it('returns the original reminder when the same key and payload are replayed', async () => {
    const transaction = vi.fn();
    const prisma = {
      reminderCreateRequest: {
        findUnique: vi.fn().mockResolvedValue({
          requestHash: requestHashForDto(),
          reminder: reminderRecord(),
        }),
      },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new RemindersService(prisma, new ReminderScheduleService());

    const result = await service.create(
      { userId, sessionId },
      key,
      dto,
      new Date('2026-10-01T07:00:00.000Z'),
    );

    expect(result.idempotency).toEqual({ key, replayed: true });
    expect(result.id).toBe('30000000-0000-4000-8000-000000000001');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('commits the reminder, schedule, first occurrence, event, and key in one transaction', async () => {
    const record = reminderRecord();
    const tx = {
      reminder: { create: vi.fn().mockResolvedValue({ id: record.id }) },
      schedule: { create: vi.fn().mockResolvedValue({ id: record.schedules[0]!.id }) },
      reminderOccurrence: {
        create: vi.fn().mockResolvedValue({ id: record.occurrences[0]!.id }),
      },
      reminderEvent: { create: vi.fn().mockResolvedValue({}) },
      reminderCreateRequest: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      reminderCreateRequest: { findUnique: vi.fn().mockResolvedValue(null) },
      reminder: { findFirst: vi.fn().mockResolvedValue(record) },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    } as unknown as PrismaService;
    const service = new RemindersService(prisma, new ReminderScheduleService());

    const result = await service.create({ userId, sessionId }, key, dto, now);

    expect(result.idempotency).toEqual({ key, replayed: false });
    expect(tx.reminder.create).toHaveBeenCalledOnce();
    expect(tx.schedule.create).toHaveBeenCalledOnce();
    expect(tx.reminderOccurrence.create).toHaveBeenCalledOnce();
    expect(tx.reminderEvent.create).toHaveBeenCalledOnce();
    expect(tx.reminderCreateRequest.create).toHaveBeenCalledOnce();
  });

  it('rejects reuse of the key with a materially different payload', async () => {
    const storedHash = requestHashForDto();
    const prisma = {
      reminderCreateRequest: {
        findUnique: vi.fn().mockResolvedValue({
          requestHash: storedHash,
          reminder: reminderRecord(),
        }),
      },
    } as unknown as PrismaService;
    const service = new RemindersService(prisma, new ReminderScheduleService());

    await expect(
      service.create(
        { userId, sessionId },
        key,
        { ...dto, title: 'Call Jane' },
        now,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects creation when the resolved instant differs from the confirmed preview', async () => {
    const prisma = {
      reminderCreateRequest: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new RemindersService(prisma, new ReminderScheduleService());

    await expect(
      service.create(
        { userId, sessionId },
        key,
        { ...dto, confirmedResolvedAt: '2026-09-27T07:00:00.000Z' },
        now,
      ),
    ).rejects.toThrow('differs from the confirmed preview');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  function requestHashForDto(): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          title: dto.title,
          contextNote: dto.contextNote,
          schedule: {
            type: dto.schedule.type,
            localDate: dto.schedule.localDate,
            localTime: dto.schedule.localTime,
            timezone: dto.schedule.timezone,
            weekdays: [],
            endDate: null,
            occurrenceCount: null,
          },
          confirmed: true,
          confirmedResolvedAt: dto.confirmedResolvedAt,
        }),
      )
      .digest('hex');
  }
});
