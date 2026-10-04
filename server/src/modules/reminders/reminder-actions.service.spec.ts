import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../database/prisma.service.js';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { ReminderActionsService } from './reminder-actions.service.js';
import type { ReminderAutomationService } from './reminder-automation.service.js';

describe('ReminderActionsService', () => {
  const principal: AuthPrincipal = {
    userId: '10000000-0000-4000-8000-000000000001',
    sessionId: '20000000-0000-4000-8000-000000000001',
  };
  const occurrenceId = '30000000-0000-4000-8000-000000000001';
  const reminderId = '40000000-0000-4000-8000-000000000001';
  const scheduledAt = new Date('2026-09-30T05:00:00.000Z');
  const now = new Date('2026-09-30T06:00:00.000Z');

  function setup(overrides?: { scheduleType?: 'ONE_TIME' | 'DAILY'; remaining?: number }) {
    const occurrence = {
      id: occurrenceId,
      reminderId,
      scheduleId: '50000000-0000-4000-8000-000000000001',
      scheduleRevision: 1,
      sequence: 1,
      occurrenceKey: 'key',
      originalScheduledAt: scheduledAt,
      effectiveScheduledAt: scheduledAt,
      localDate: '2026-09-30',
      localTime: '08:00',
      lifecycle: 'SCHEDULED' as const,
      completedAt: null,
      skippedAt: null,
      cancelledAt: null,
      createdAt: scheduledAt,
      reminder: { id: reminderId, lifecycle: 'ACTIVE' as const },
      schedule: { type: overrides?.scheduleType ?? 'DAILY', nextEvaluationAt: null },
    };
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: principal.userId }) },
      reminderOccurrence: {
        findFirst: vi.fn().mockResolvedValue(occurrence),
        findUnique: vi.fn().mockResolvedValue(occurrence),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(overrides?.remaining ?? 0),
      },
      notificationAttempt: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      reminder: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      reminderEvent: {
        create: vi.fn().mockResolvedValue({ id: '60000000-0000-4000-8000-000000000001' }),
      },
    };
    const prisma = {
      reminderEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const automations = {
      advanceWithinTransaction: vi.fn().mockResolvedValue([]),
    } as unknown as ReminderAutomationService;
    return { service: new ReminderActionsService(prisma, automations), tx };
  }

  it('completes a due occurrence atomically and archives an exhausted finite series', async () => {
    const { service, tx } = setup();
    const result = await service.complete(
      principal,
      occurrenceId,
      'complete-action-1',
      { expectedScheduleRevision: 1, expectedEffectiveScheduledAt: scheduledAt.toISOString() },
      now,
    );

    expect(result).toMatchObject({
      occurrenceId,
      lifecycle: 'COMPLETED',
      reminderLifecycle: 'ARCHIVED',
      idempotency: { replayed: false },
    });
    expect(tx.reminderOccurrence.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lifecycle: 'COMPLETED', completedAt: now }) }),
    );
    expect(tx.reminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lifecycle: 'ARCHIVED' }) }),
    );
    expect(tx.reminderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'OCCURRENCE_COMPLETED' }) }),
    );
  });

  it('does not allow a one-time occurrence to be skipped', async () => {
    const { service, tx } = setup({ scheduleType: 'ONE_TIME' });

    await expect(
      service.skip(
        principal,
        occurrenceId,
        'skip-action-1',
        { expectedScheduleRevision: 1, expectedEffectiveScheduledAt: scheduledAt.toISOString() },
        now,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.reminderOccurrence.updateMany).not.toHaveBeenCalled();
  });

  it('requires a real content change before incrementing a reminder revision', async () => {
    const { service } = setup();
    await expect(
      service.updateContent(principal, reminderId, 'update-content-1', { expectedRevision: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
