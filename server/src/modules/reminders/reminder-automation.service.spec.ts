import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../database/prisma.service.js';
import type { Environment } from '../../config/env.schema.js';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { ContextTriggerTypeDto, WorkflowStepConditionDto } from './dto/reminder-automation.dto.js';
import { ReminderAutomationService } from './reminder-automation.service.js';
import { ReminderScheduleService } from './reminder-schedule.service.js';

describe('ReminderAutomationService', () => {
  const principal: AuthPrincipal = {
    userId: '10000000-0000-4000-8000-000000000001',
    sessionId: '20000000-0000-4000-8000-000000000001',
  };
  const reminderId = '30000000-0000-4000-8000-000000000001';
  const config = {
    get: vi.fn((key: keyof Environment) =>
      key === 'CONTEXT_DATA_KEY_BASE64'
        ? Buffer.alloc(32, 5).toString('base64')
        : 'test-pepper-that-is-at-least-32-characters',
    ),
  } as unknown as ConfigService<Environment, true>;

  it('creates an ordered completion workflow and increments the source revision', async () => {
    const workflow = {
      id: '40000000-0000-4000-8000-000000000001',
      sourceReminderId: reminderId,
      name: 'Client follow-up',
      lifecycle: 'ACTIVE',
      revision: 1,
      steps: [
        {
          id: '50000000-0000-4000-8000-000000000001',
          position: 1,
          title: 'Send the proposal',
          contextNote: null,
          delayMinutes: 0,
          condition: 'PREVIOUS_COMPLETED',
        },
      ],
      createdAt: new Date('2026-10-04T10:00:00.000Z'),
      updatedAt: new Date('2026-10-04T10:00:00.000Z'),
    };
    const tx = {
      reminder: {
        findFirst: vi.fn().mockResolvedValue({ id: reminderId, lifecycle: 'ACTIVE', revision: 2 }),
        update: vi.fn().mockResolvedValue({}),
      },
      reminderWorkflow: { create: vi.fn().mockResolvedValue(workflow) },
      reminderEvent: {
        create: vi.fn().mockResolvedValue({ id: '60000000-0000-4000-8000-000000000001' }),
      },
    };
    const prisma = {
      reminderEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ReminderAutomationService(prisma, new ReminderScheduleService(), config);

    const result = await service.createWorkflow(
      principal,
      reminderId,
      'workflow-create-1',
      {
        expectedReminderRevision: 2,
        name: 'Client follow-up',
        steps: [{
          title: 'Send the proposal',
          delayMinutes: 0,
          condition: WorkflowStepConditionDto.PREVIOUS_COMPLETED,
        }],
      },
    );

    expect(result).toMatchObject({ id: workflow.id, sourceReminderRevision: 3 });
    expect(tx.reminderWorkflow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          steps: { create: [expect.objectContaining({ position: 1, title: 'Send the proposal' })] },
        }),
      }),
    );
  });

  it('encrypts precise location coordinates before persistence', async () => {
    const createdAt = new Date('2026-10-04T10:00:00.000Z');
    const triggerCreate = vi.fn().mockImplementation(({ data }) => ({
      id: '40000000-0000-4000-8000-000000000001',
      reminderId,
      type: data.type,
      lifecycle: 'ACTIVE',
      label: data.label,
      locationCiphertext: data.locationCiphertext,
      radiusMeters: data.radiusMeters,
      cooldownSeconds: data.cooldownSeconds,
      revision: 1,
      lastTriggeredAt: null,
      unavailableReason: null,
      createdAt,
      updatedAt: createdAt,
    }));
    const tx = {
      reminder: {
        findFirst: vi.fn().mockResolvedValue({ id: reminderId, lifecycle: 'ACTIVE', revision: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      contextTrigger: { create: triggerCreate },
      reminderEvent: {
        create: vi.fn().mockResolvedValue({ id: '60000000-0000-4000-8000-000000000001' }),
      },
    };
    const prisma = {
      reminderEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ReminderAutomationService(prisma, new ReminderScheduleService(), config);

    const result = await service.createContextTrigger(
      principal,
      reminderId,
      'location-trigger-1',
      {
        expectedReminderRevision: 1,
        type: ContextTriggerTypeDto.LOCATION_ARRIVE,
        label: 'Office',
        latitude: 9.03,
        longitude: 38.74,
        radiusMeters: 150,
        cooldownSeconds: 300,
      },
    );

    const persisted = triggerCreate.mock.calls[0]![0].data as Record<string, unknown>;
    expect(persisted).not.toHaveProperty('latitude');
    expect(persisted).not.toHaveProperty('longitude');
    expect(persisted.locationCiphertext).toEqual(expect.any(String));
    expect(result).toMatchObject({
      location: { latitude: 9.03, longitude: 38.74, radiusMeters: 150 },
    });
  });

  it('stores a keyed fingerprint instead of the Wi-Fi network name', async () => {
    const createdAt = new Date('2026-10-04T10:00:00.000Z');
    const triggerCreate = vi.fn().mockImplementation(({ data }) => ({
      id: '40000000-0000-4000-8000-000000000002',
      reminderId,
      type: data.type,
      lifecycle: 'ACTIVE',
      label: data.label,
      locationCiphertext: null,
      radiusMeters: null,
      cooldownSeconds: data.cooldownSeconds,
      revision: 1,
      lastTriggeredAt: null,
      unavailableReason: null,
      createdAt,
      updatedAt: createdAt,
    }));
    const tx = {
      reminder: {
        findFirst: vi.fn().mockResolvedValue({ id: reminderId, lifecycle: 'ACTIVE', revision: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      contextTrigger: { create: triggerCreate },
      reminderEvent: {
        create: vi.fn().mockResolvedValue({ id: '60000000-0000-4000-8000-000000000002' }),
      },
    };
    const prisma = {
      reminderEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ReminderAutomationService(prisma, new ReminderScheduleService(), config);

    await service.createContextTrigger(
      principal,
      reminderId,
      'wifi-trigger-1',
      {
        expectedReminderRevision: 1,
        type: ContextTriggerTypeDto.WIFI_CONNECT,
        label: 'Office Wi-Fi',
        networkName: 'Private Office Network',
        cooldownSeconds: 300,
      },
    );

    const persisted = triggerCreate.mock.calls[0]![0].data as Record<string, unknown>;
    expect(persisted).not.toHaveProperty('networkName');
    expect(persisted.networkFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(persisted)).not.toContain('Private Office Network');
  });
});
