import type { PrismaService } from '../../database/prisma.service.js';
import { ReminderScheduleService } from './reminder-schedule.service.js';
import { RemindersService } from './reminders.service.js';

describe('RemindersService reads', () => {
  const userId = '10000000-0000-4000-8000-000000000001';
  const reminderId = '30000000-0000-4000-8000-000000000001';
  const occurrenceId = '50000000-0000-4000-8000-000000000001';
  const scheduleId = '40000000-0000-4000-8000-000000000001';
  const scheduledAt = new Date('2026-09-28T06:00:00.000Z');

  it('lists only owned active scheduled occurrences in stable time order', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: occurrenceId,
        sequence: 1,
        scheduleRevision: 1,
        lifecycle: 'SCHEDULED',
        localDate: '2026-09-28',
        localTime: '09:00',
        originalScheduledAt: scheduledAt,
        effectiveScheduledAt: scheduledAt,
        reminder: {
          id: reminderId,
          title: 'Call John',
          contextNote: null,
          revision: 1,
        },
        schedule: {
          id: scheduleId,
          type: 'DAILY',
          timezone: 'Africa/Addis_Ababa',
          recurrenceWeekdays: [],
          revision: 1,
        },
      },
    ]);
    const prisma = {
      reminderOccurrence: { findMany },
    } as unknown as PrismaService;
    const service = new RemindersService(prisma, new ReminderScheduleService());

    const result = await service.listOccurrences(userId, {
      from: '2026-09-27T00:00:00.000Z',
      to: '2026-10-27T00:00:00.000Z',
      limit: 20,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lifecycle: 'SCHEDULED',
          reminder: { userId, lifecycle: 'ACTIVE' },
        }),
        orderBy: [{ effectiveScheduledAt: 'asc' }, { id: 'asc' }],
        take: 21,
      }),
    );
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: occurrenceId,
          reminderId,
          title: 'Call John',
          effectiveScheduledAt: scheduledAt.toISOString(),
        }),
      ],
      nextCursor: null,
    });
  });

  it('loads reminder detail through an ownership-scoped query', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: reminderId,
      title: 'Call John',
      contextNote: null,
      lifecycle: 'ACTIVE',
      revision: 1,
      createdAt: scheduledAt,
      updatedAt: scheduledAt,
      schedules: [
        {
          id: scheduleId,
          type: 'ONE_TIME',
          localStartDate: '2026-09-28',
          localStartTime: '09:00',
          timezone: 'Africa/Addis_Ababa',
          recurrenceWeekdays: [],
          endLocalDate: null,
          occurrenceCount: null,
          resolvedStartAt: scheduledAt,
          resolvedUtcOffsetMin: 180,
          revision: 1,
          materializedThrough: scheduledAt,
        },
      ],
    });
    const findMany = vi.fn().mockResolvedValue([
        {
          id: occurrenceId,
          scheduleId,
          scheduleRevision: 1,
          sequence: 1,
          lifecycle: 'SCHEDULED',
          localDate: '2026-09-28',
          localTime: '09:00',
          originalScheduledAt: scheduledAt,
          effectiveScheduledAt: scheduledAt,
        },
    ]);
    const prisma = {
      reminder: { findFirst },
      reminderOccurrence: { findMany },
    } as unknown as PrismaService;
    const service = new RemindersService(prisma, new ReminderScheduleService());

    const result = await service.getReminder(userId, reminderId);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: reminderId, userId } }),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reminderId, scheduleId },
        take: 128,
      }),
    );
    expect(result).toMatchObject({
      id: reminderId,
      schedule: { timezone: 'Africa/Addis_Ababa' },
      occurrences: [{ id: occurrenceId, sequence: 1 }],
    });
  });
});
