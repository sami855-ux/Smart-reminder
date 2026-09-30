import { BadRequestException, ConflictException } from '@nestjs/common';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import type { PrismaService } from '../../database/prisma.service.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationOutcomeDto } from './dto/notification.dto.js';

describe('NotificationsService', () => {
  const principal: AuthPrincipal = {
    userId: '10000000-0000-4000-8000-000000000001',
    sessionId: '20000000-0000-4000-8000-000000000001',
  };

  it('creates revision-one notification preferences from revision zero', async () => {
    const createdAt = new Date('2026-09-30T06:00:00.000Z');
    const tx = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: principal.userId }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ timezone: 'UTC' }),
      },
      notificationPreference: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          userId: principal.userId,
          quietHoursStart: '22:00',
          quietHoursEnd: '07:00',
          timezone: 'Africa/Addis_Ababa',
          lockScreenPrivacy: 'TITLE_ONLY',
          globallyPaused: false,
          revision: 1,
          createdAt,
          updatedAt: createdAt,
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new NotificationsService(prisma);

    const result = await service.updatePreferences(principal, {
      expectedRevision: 0,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
      timezone: 'Africa/Addis_Ababa',
    });

    expect(result).toMatchObject({ revision: 1, quietHoursStart: '22:00', quietHoursEnd: '07:00' });
    expect(tx.notificationPreference.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ timezone: 'Africa/Addis_Ababa' }) }),
    );
  });

  it('rejects a half-configured quiet-hours window', async () => {
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: principal.userId }) },
      notificationPreference: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new NotificationsService(prisma);

    await expect(
      service.updatePreferences(principal, {
        expectedRevision: 0,
        quietHoursStart: '22:00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires optimistic concurrency when reconciling an existing installation', async () => {
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: principal.userId }) },
      deviceInstallation: {
        findUnique: vi.fn().mockResolvedValue({
          id: '30000000-0000-4000-8000-000000000001',
          userId: principal.userId,
          revision: 2,
          revokedAt: null,
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new NotificationsService(prisma);

    await expect(
      service.registerDevice(principal, '30000000-0000-4000-8000-000000000001', {
        platform: 'ANDROID',
        appVersion: '1.0.0',
        permissionState: 'GRANTED',
        locale: 'en-US',
        timezone: 'UTC',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects stale preference revisions with a conflict', async () => {
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: principal.userId }) },
      notificationPreference: {
        findUnique: vi.fn().mockResolvedValue({ revision: 4 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new NotificationsService(prisma);

    await expect(
      service.updatePreferences(principal, { expectedRevision: 3, globallyPaused: true }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('records a scheduling acknowledgement against the exact effective occurrence instant', async () => {
    const now = new Date('2026-09-30T06:00:00.000Z');
    const effectiveScheduledAt = new Date('2026-10-01T06:00:00.000Z');
    const occurrenceId = '30000000-0000-4000-8000-000000000001';
    const installationId = '40000000-0000-4000-8000-000000000001';
    const reminderId = '50000000-0000-4000-8000-000000000001';
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: principal.userId }) },
      reminderOccurrence: {
        findFirst: vi.fn().mockResolvedValue({
          id: occurrenceId,
          reminderId,
          scheduleRevision: 2,
          effectiveScheduledAt,
        }),
      },
      deviceInstallation: { findFirst: vi.fn().mockResolvedValue({ id: installationId }) },
      notificationAttempt: {
        upsert: vi.fn().mockResolvedValue({
          id: '60000000-0000-4000-8000-000000000001',
          logicalKey: `${occurrenceId}:${installationId}:2:${effectiveScheduledAt.toISOString()}:0`,
          occurrenceId,
          deviceInstallationId: installationId,
          scheduleRevision: 2,
          effectiveScheduledAt,
          nudgeStep: 0,
          requestedAt: now,
          locallyScheduledAt: now,
          schedulingFailedAt: null,
          cancelledAt: null,
          openedAt: null,
          actedOnAt: null,
          osNotificationId: 'os-42',
          errorCode: null,
        }),
      },
      reminderEvent: {
        create: vi.fn().mockResolvedValue({ id: '70000000-0000-4000-8000-000000000001' }),
      },
    };
    const prisma = {
      reminderEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new NotificationsService(prisma);

    const result = await service.reportAttempt(
      principal,
      'notification-report-1',
      {
        occurrenceId,
        deviceInstallationId: installationId,
        scheduleRevision: 2,
        effectiveScheduledAt: effectiveScheduledAt.toISOString(),
        nudgeStep: 0,
        outcome: NotificationOutcomeDto.LOCALLY_SCHEDULED,
        osNotificationId: 'os-42',
      },
      now,
    );

    expect(result).toMatchObject({
      occurrenceId,
      effectiveScheduledAt: effectiveScheduledAt.toISOString(),
      locallyScheduledAt: now.toISOString(),
      idempotency: { replayed: false },
    });
    expect(tx.reminderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'NOTIFICATION_SCHEDULED' }) }),
    );
  });
});
