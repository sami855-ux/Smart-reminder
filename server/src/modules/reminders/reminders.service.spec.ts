import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../database/prisma.service.js';
import { ReminderScheduleTypeDto } from './dto/reminder-schedule.dto.js';
import { ContextTriggerTypeDto, WorkflowStepConditionDto } from './dto/reminder-automation.dto.js';
import { ReminderScheduleService } from './reminder-schedule.service.js';
import { RemindersService } from './reminders.service.js';
import type { ReminderAutomationService } from './reminder-automation.service.js';

describe('RemindersService idempotent creation', () => {
  const userId = '10000000-0000-4000-8000-000000000001';
  const sessionId = '20000000-0000-4000-8000-000000000001';
  const key = 'create-reminder-0001';
  const now = new Date('2026-09-26T07:00:00.000Z');
  const automations = {} as ReminderAutomationService;
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
      checklistTemplates: [],
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
          checklistItems: [],
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
    const service = new RemindersService(prisma, new ReminderScheduleService(), automations);

    const result = await service.create(
      { userId, sessionId },
      key,
      dto,
      new Date('2026-10-01T07:00:00.000Z'),
    );

    expect(result.idempotency).toEqual({ key, replayed: true });
    expect(result.id).toBe('30000000-0000-4000-8000-000000000001');
    expect(result.occurrences).toEqual([
      expect.objectContaining({
        id: '50000000-0000-4000-8000-000000000001',
        sequence: 1,
      }),
    ]);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('commits the reminder, schedule, first occurrence, event, and key in one transaction', async () => {
    const record = reminderRecord();
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: userId }) },
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
    const service = new RemindersService(prisma, new ReminderScheduleService(), automations);

    const result = await service.create({ userId, sessionId }, key, dto, now);

    expect(result.idempotency).toEqual({ key, replayed: false });
    expect(result.occurrences).toHaveLength(1);
    expect(tx.reminder.create).toHaveBeenCalledOnce();
    expect(tx.schedule.create).toHaveBeenCalledOnce();
    expect(tx.reminderOccurrence.create).toHaveBeenCalledOnce();
    expect(tx.reminderEvent.create).toHaveBeenCalledOnce();
    expect(tx.reminderCreateRequest.create).toHaveBeenCalledOnce();
  });

  it('creates checklist templates and per-occurrence snapshots in the reminder transaction', async () => {
    const record = reminderRecord();
    const template = {
      id: '70000000-0000-4000-8000-000000000001',
      text: 'Bring the signed form',
      position: 0,
      revision: 1,
    };
    const snapshot = {
      id: '80000000-0000-4000-8000-000000000001',
      sourceItemId: template.id,
      text: template.text,
      position: 0,
      checkedAt: null,
      revision: 1,
    };
    const stored = {
      ...record,
      checklistTemplates: [template],
      occurrences: record.occurrences.map((occurrence) => ({
        ...occurrence,
        checklistItems: [snapshot],
      })),
    };
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: userId }) },
      reminder: { create: vi.fn().mockResolvedValue({ id: record.id }) },
      schedule: { create: vi.fn().mockResolvedValue({ id: record.schedules[0]!.id }) },
      reminderOccurrence: {
        create: vi.fn().mockResolvedValue({ id: record.occurrences[0]!.id }),
        findMany: vi.fn().mockResolvedValue([{ id: record.occurrences[0]!.id }]),
      },
      reminderChecklistItem: { create: vi.fn().mockResolvedValue(template) },
      occurrenceChecklistItem: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      reminderEvent: { create: vi.fn().mockResolvedValue({}) },
      reminderCreateRequest: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      reminderCreateRequest: { findUnique: vi.fn().mockResolvedValue(null) },
      reminder: { findFirst: vi.fn().mockResolvedValue(stored) },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    } as unknown as PrismaService;
    const service = new RemindersService(prisma, new ReminderScheduleService(), automations);

    const result = await service.create(
      { userId, sessionId },
      'create-reminder-checklist-1',
      { ...dto, checklist: [{ text: template.text }] },
      now,
    );

    expect(tx.reminderChecklistItem.create).toHaveBeenCalledOnce();
    expect(tx.occurrenceChecklistItem.createMany).toHaveBeenCalledWith({
      data: [{
        occurrenceId: record.occurrences[0]!.id,
        sourceItemId: template.id,
        text: template.text,
        position: 0,
      }],
    });
    expect(result.checklist).toEqual([template]);
    expect(result.occurrences[0]!.checklist).toEqual([
      expect.objectContaining({ text: template.text, checked: false }),
    ]);
  });

  it('creates an initial completion chain in the same idempotent transaction', async () => {
    const record = { ...reminderRecord(), revision: 2 };
    const workflow = {
      id: '90000000-0000-4000-8000-000000000001',
      name: 'After the call',
    };
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: userId }) },
      reminder: { create: vi.fn().mockResolvedValue({ id: record.id, revision: 2 }) },
      schedule: { create: vi.fn().mockResolvedValue({ id: record.schedules[0]!.id }) },
      reminderOccurrence: {
        create: vi.fn().mockResolvedValue({ id: record.occurrences[0]!.id }),
      },
      reminderWorkflow: { create: vi.fn().mockResolvedValue(workflow) },
      reminderEvent: { create: vi.fn().mockResolvedValue({}) },
      reminderCreateRequest: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      reminderCreateRequest: { findUnique: vi.fn().mockResolvedValue(null) },
      reminder: { findFirst: vi.fn().mockResolvedValue(record) },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    } as unknown as PrismaService;
    const service = new RemindersService(prisma, new ReminderScheduleService(), automations);

    const result = await service.create(
      { userId, sessionId },
      'create-reminder-chain-1',
      {
        ...dto,
        workflow: {
          name: workflow.name,
          steps: [
            { title: 'Send the proposal', delayMinutes: 15, condition: WorkflowStepConditionDto.PREVIOUS_COMPLETED },
            { title: 'Confirm receipt', delayMinutes: 60, condition: WorkflowStepConditionDto.ALL_CHECKLIST_COMPLETED },
          ],
        },
      },
      now,
    );

    expect(tx.reminder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ revision: 2 }),
    });
    expect(tx.reminderWorkflow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceReminderId: record.id,
        steps: { create: [
          expect.objectContaining({ position: 1, title: 'Send the proposal' }),
          expect.objectContaining({ position: 2, title: 'Confirm receipt' }),
        ] },
      }),
    });
    expect(tx.reminderEvent.create).toHaveBeenCalledTimes(2);
    expect(result.revision).toBe(2);
  });

  it('creates secured context triggers atomically with the reminder', async () => {
    const record = { ...reminderRecord(), revision: 2 };
    const triggerId = '90000000-0000-4000-8000-000000000002';
    const contextTrigger = {
      type: ContextTriggerTypeDto.WIFI_CONNECT,
      label: 'Office network',
      networkName: 'Private Office Wi-Fi',
      cooldownSeconds: 300,
    };
    const triggerCreate = vi.fn().mockImplementation(({ data }) => ({ id: data.id, type: data.type }));
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: userId }) },
      reminder: { create: vi.fn().mockResolvedValue({ id: record.id, revision: 2 }) },
      schedule: { create: vi.fn().mockResolvedValue({ id: record.schedules[0]!.id }) },
      reminderOccurrence: { create: vi.fn().mockResolvedValue({ id: record.occurrences[0]!.id }) },
      contextTrigger: { create: triggerCreate },
      reminderEvent: { create: vi.fn().mockResolvedValue({}) },
      reminderCreateRequest: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      reminderCreateRequest: { findUnique: vi.fn().mockResolvedValue(null) },
      reminder: { findFirst: vi.fn().mockResolvedValue(record) },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    } as unknown as PrismaService;
    const automationMock = {
      prepareContextTriggerData: vi.fn().mockReturnValue({
        id: triggerId,
        locationCiphertext: null,
        locationKeyVersion: null,
        networkFingerprint: 'f'.repeat(64),
      }),
      contextTriggerRequestCommitment: vi.fn().mockReturnValue('private-request-commitment'),
      internalEventKey: vi.fn().mockReturnValue('private-child-event-key'),
    } as unknown as ReminderAutomationService;
    const service = new RemindersService(prisma, new ReminderScheduleService(), automationMock);

    await service.create(
      { userId, sessionId },
      'create-reminder-context-1',
      { ...dto, contextTriggers: [contextTrigger] },
      now,
    );

    expect(triggerCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: triggerId,
        networkFingerprint: 'f'.repeat(64),
        locationCiphertext: null,
      }),
    });
    expect(JSON.stringify(triggerCreate.mock.calls[0]![0])).not.toContain(contextTrigger.networkName);
    expect(tx.reminderEvent.create).toHaveBeenCalledTimes(2);
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
    const service = new RemindersService(prisma, new ReminderScheduleService(), automations);

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
    const service = new RemindersService(prisma, new ReminderScheduleService(), automations);

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
          checklist: [],
          workflow: null,
          contextTriggers: [],
        }),
      )
      .digest('hex');
  }
});
