import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  NotificationOutcomeDto,
  type RegisterDeviceInstallationDto,
  type ReportNotificationAttemptDto,
  type UpdateNotificationPreferencesDto,
  type UpdateProfilePreferencesDto,
} from './dto/notification.dto.js';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async registerDevice(
    principal: AuthPrincipal,
    installationId: string,
    dto: RegisterDeviceInstallationDto,
    now = new Date(),
  ) {
    this.assertTimezone(dto.timezone);
    return this.prisma.$transaction(async (tx) => {
      await this.claimActiveAccount(tx, principal.userId);
      const existing = await tx.deviceInstallation.findUnique({ where: { id: installationId } });
      if (existing && existing.userId !== principal.userId) {
        throw new NotFoundException('Device installation not found.');
      }
      if (existing?.revokedAt) {
        throw new ConflictException('A revoked installation cannot be reopened; register a new ID.');
      }
      if (existing) {
        if (dto.expectedRevision === undefined) {
          throw new BadRequestException('expectedRevision is required for an existing installation.');
        }
        const updated = await tx.deviceInstallation.updateMany({
          where: {
            id: installationId,
            userId: principal.userId,
            revokedAt: null,
            revision: dto.expectedRevision,
          },
          data: {
            platform: dto.platform,
            appVersion: dto.appVersion,
            permissionState: dto.permissionState,
            locale: dto.locale,
            timezone: dto.timezone,
            revision: { increment: 1 },
            lastSeenAt: now,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException({
            code: 'DEVICE_REVISION_CONFLICT',
            message: 'The device installation changed. Refresh it before updating.',
            details: { installationId, revision: existing.revision, revokedAt: existing.revokedAt },
          });
        }
      } else {
        if (dto.expectedRevision !== undefined) {
          throw new ConflictException('The device installation does not exist yet.');
        }
        await tx.deviceInstallation.create({
          data: {
            id: installationId,
            userId: principal.userId,
            platform: dto.platform,
            appVersion: dto.appVersion,
            permissionState: dto.permissionState,
            locale: dto.locale,
            timezone: dto.timezone,
            lastSeenAt: now,
          },
        });
      }
      const installation = await tx.deviceInstallation.findUniqueOrThrow({
        where: { id: installationId },
      });
      return this.toDevice(installation);
    }, { isolationLevel: 'Serializable' });
  }

  async listDevices(userId: string) {
    const devices = await this.prisma.deviceInstallation.findMany({
      where: { userId },
      orderBy: [{ revokedAt: 'asc' }, { lastSeenAt: 'desc' }, { id: 'asc' }],
      take: 100,
    });
    return { items: devices.map((device) => this.toDevice(device)) };
  }

  async revokeDevice(userId: string, installationId: string, now = new Date()) {
    const device = await this.prisma.deviceInstallation.findFirst({
      where: { id: installationId, userId },
    });
    if (!device) throw new NotFoundException('Device installation not found.');
    if (device.revokedAt) return this.toDevice(device);
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.claimActiveAccount(tx, userId);
      const revoked = await tx.deviceInstallation.update({
        where: { id: installationId },
        data: { revokedAt: now, revision: { increment: 1 } },
      });
      await tx.notificationAttempt.updateMany({
        where: { deviceInstallationId: installationId, cancelledAt: null },
        data: { cancelledAt: now },
      });
      return revoked;
    }, { isolationLevel: 'Serializable' });
    return this.toDevice(updated);
  }

  async getPreferences(userId: string) {
    const existing = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    if (existing) return this.toPreferences(existing);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: 'ACTIVE', deletedAt: null },
      select: { timezone: true },
    });
    if (!user) throw new NotFoundException('Account not found.');
    return {
      userId,
      quietHoursStart: null,
      quietHoursEnd: null,
      timezone: user.timezone,
      lockScreenPrivacy: 'TITLE_ONLY' as const,
      globallyPaused: false,
      revision: 0,
      createdAt: null,
      updatedAt: null,
    };
  }

  async getProfilePreferences(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: 'ACTIVE', deletedAt: null },
      select: { id: true, locale: true, timezone: true, timeFormat: true, profileRevision: true },
    });
    if (!user) throw new NotFoundException('Account not found.');
    return {
      userId: user.id,
      locale: user.locale,
      timezone: user.timezone,
      timeFormat: user.timeFormat,
      revision: user.profileRevision,
    };
  }

  async updateProfilePreferences(userId: string, dto: UpdateProfilePreferencesDto) {
    this.assertTimezone(dto.timezone);
    const claimed = await this.prisma.user.updateMany({
      where: {
        id: userId,
        status: 'ACTIVE',
        deletedAt: null,
        profileRevision: dto.expectedRevision,
      },
      data: {
        locale: dto.locale,
        timezone: dto.timezone,
        timeFormat: dto.timeFormat,
        profileRevision: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      const current = await this.prisma.user.findFirst({
        where: { id: userId },
        select: { profileRevision: true, status: true },
      });
      throw new ConflictException({
        code: 'PROFILE_REVISION_CONFLICT',
        message: 'Profile preferences changed. Refresh them before updating.',
        ...(current ? { details: { revision: current.profileRevision, status: current.status } } : {}),
      });
    }
    return this.getProfilePreferences(userId);
  }

  async updatePreferences(
    principal: AuthPrincipal,
    dto: UpdateNotificationPreferencesDto,
  ) {
    if (dto.timezone) this.assertTimezone(dto.timezone);
    return this.prisma.$transaction(async (tx) => {
      await this.claimActiveAccount(tx, principal.userId);
      const existing = await tx.notificationPreference.findUnique({
        where: { userId: principal.userId },
      });
      if (!existing) {
        if (dto.expectedRevision !== 0) {
          throw new ConflictException('Notification preferences do not exist yet; use revision 0.');
        }
        const quietHoursStart = dto.quietHoursStart ?? null;
        const quietHoursEnd = dto.quietHoursEnd ?? null;
        this.assertQuietHoursPair(quietHoursStart, quietHoursEnd);
        const account = await tx.user.findUniqueOrThrow({
          where: { id: principal.userId },
          select: { timezone: true },
        });
        const created = await tx.notificationPreference.create({
          data: {
            userId: principal.userId,
            quietHoursStart,
            quietHoursEnd,
            timezone: dto.timezone ?? account.timezone,
            ...(dto.lockScreenPrivacy ? { lockScreenPrivacy: dto.lockScreenPrivacy } : {}),
            ...(dto.globallyPaused !== undefined ? { globallyPaused: dto.globallyPaused } : {}),
          },
        });
        return this.toPreferences(created);
      }
      if (existing.revision !== dto.expectedRevision) {
        throw new ConflictException({
          code: 'PREFERENCE_REVISION_CONFLICT',
          message: 'Notification preferences changed. Refresh them before updating.',
          details: { revision: existing.revision },
        });
      }
      const quietHoursStart =
        dto.quietHoursStart === undefined ? existing.quietHoursStart?.trim() ?? null : dto.quietHoursStart;
      const quietHoursEnd =
        dto.quietHoursEnd === undefined ? existing.quietHoursEnd?.trim() ?? null : dto.quietHoursEnd;
      this.assertQuietHoursPair(quietHoursStart, quietHoursEnd);
      const claimed = await tx.notificationPreference.updateMany({
        where: { userId: principal.userId, revision: dto.expectedRevision },
        data: {
          quietHoursStart,
          quietHoursEnd,
          ...(dto.timezone ? { timezone: dto.timezone } : {}),
          ...(dto.lockScreenPrivacy ? { lockScreenPrivacy: dto.lockScreenPrivacy } : {}),
          ...(dto.globallyPaused !== undefined ? { globallyPaused: dto.globallyPaused } : {}),
          revision: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Notification preferences changed. Refresh them before updating.');
      }
      return this.toPreferences(
        await tx.notificationPreference.findUniqueOrThrow({ where: { userId: principal.userId } }),
      );
    }, { isolationLevel: 'Serializable' });
  }

  async reportAttempt(
    principal: AuthPrincipal,
    idempotencyKey: string | undefined,
    dto: ReportNotificationAttemptDto,
    now = new Date(),
  ) {
    const key = this.validateIdempotencyKey(idempotencyKey);
    this.validateOutcome(dto);
    const requestHash = this.hash(dto);
    const replay = await this.prisma.reminderEvent.findUnique({
      where: { userId_idempotencyKey: { userId: principal.userId, idempotencyKey: key } },
    });
    if (replay) return this.replayAttempt(replay, requestHash, dto, key);
    const logicalKey = `${dto.occurrenceId}:${dto.deviceInstallationId}:${dto.scheduleRevision}:${dto.effectiveScheduledAt}:${dto.nudgeStep}`;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await this.claimActiveAccount(tx, principal.userId);
        const occurrence = await tx.reminderOccurrence.findFirst({
          where: { id: dto.occurrenceId, reminder: { userId: principal.userId } },
          select: {
            id: true,
            reminderId: true,
            scheduleRevision: true,
            effectiveScheduledAt: true,
          },
        });
        if (!occurrence) throw new NotFoundException('Occurrence not found.');
        const device = await tx.deviceInstallation.findFirst({
          where: { id: dto.deviceInstallationId, userId: principal.userId, revokedAt: null },
          select: { id: true },
        });
        if (!device) throw new NotFoundException('Active device installation not found.');
        if (
          occurrence.scheduleRevision !== dto.scheduleRevision ||
          occurrence.effectiveScheduledAt.toISOString() !== dto.effectiveScheduledAt
        ) {
          throw new ConflictException({
            code: 'NOTIFICATION_REVISION_CONFLICT',
            message: 'The occurrence schedule revision changed.',
            details: {
              scheduleRevision: occurrence.scheduleRevision,
              effectiveScheduledAt: occurrence.effectiveScheduledAt.toISOString(),
            },
          });
        }
        const attempt = await tx.notificationAttempt.upsert({
          where: { logicalKey },
          create: {
            userId: principal.userId,
            reminderId: occurrence.reminderId,
            occurrenceId: occurrence.id,
            deviceInstallationId: device.id,
            scheduleRevision: dto.scheduleRevision,
            effectiveScheduledAt: new Date(dto.effectiveScheduledAt),
            nudgeStep: dto.nudgeStep,
            logicalKey,
            ...this.outcomeData(dto, now),
          },
          update: this.outcomeData(dto, now),
        });
        const event = await tx.reminderEvent.create({
          data: {
            userId: principal.userId,
            reminderId: occurrence.reminderId,
            occurrenceId: occurrence.id,
            actorType: 'DEVICE',
            actorId: device.id,
            type: this.outcomeEvent(dto.outcome),
            idempotencyKey: key,
            requestHash,
            metadata: {
              deviceInstallationId: device.id,
              scheduleRevision: dto.scheduleRevision,
              nudgeStep: dto.nudgeStep,
              outcome: dto.outcome,
              ...(dto.errorCode ? { errorCode: dto.errorCode } : {}),
            },
          },
        });
        return { attempt, eventId: event.id };
      }, { isolationLevel: 'Serializable' });
      return {
        ...this.toAttempt(result.attempt),
        eventId: result.eventId,
        idempotency: { key, replayed: false },
      };
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const raced = await this.prisma.reminderEvent.findUnique({
        where: { userId_idempotencyKey: { userId: principal.userId, idempotencyKey: key } },
      });
      if (!raced) throw error;
      return this.replayAttempt(raced, requestHash, dto, key);
    }
  }

  private async replayAttempt(
    event: { id: string; requestHash: string | null },
    requestHash: string,
    dto: ReportNotificationAttemptDto,
    key: string,
  ) {
    if (!event.requestHash || event.requestHash !== requestHash) {
      throw new ConflictException('This idempotency key was already used with a different request.');
    }
    const attempt = await this.prisma.notificationAttempt.findUnique({
      where: {
        occurrenceId_deviceInstallationId_scheduleRevision_effectiveScheduledAt_nudgeStep: {
          occurrenceId: dto.occurrenceId,
          deviceInstallationId: dto.deviceInstallationId,
          scheduleRevision: dto.scheduleRevision,
          effectiveScheduledAt: new Date(dto.effectiveScheduledAt),
          nudgeStep: dto.nudgeStep,
        },
      },
    });
    return {
      ...(attempt ? this.toAttempt(attempt) : { id: null }),
      eventId: event.id,
      idempotency: { key, replayed: true },
    };
  }

  private outcomeData(dto: ReportNotificationAttemptDto, now: Date) {
    switch (dto.outcome) {
      case NotificationOutcomeDto.REQUESTED:
        return { requestedAt: now };
      case NotificationOutcomeDto.LOCALLY_SCHEDULED:
        return {
          locallyScheduledAt: now,
          schedulingFailedAt: null,
          errorCode: null,
          osNotificationId: dto.osNotificationId ?? null,
        };
      case NotificationOutcomeDto.SCHEDULING_FAILED:
        return { schedulingFailedAt: now, errorCode: dto.errorCode ?? null };
      case NotificationOutcomeDto.CANCELLED:
        return { cancelledAt: now };
      case NotificationOutcomeDto.OPENED:
        return { openedAt: now };
      case NotificationOutcomeDto.ACTED_ON:
        return { actedOnAt: now };
    }
  }

  private outcomeEvent(outcome: NotificationOutcomeDto) {
    const events = {
      [NotificationOutcomeDto.REQUESTED]: 'NOTIFICATION_REQUESTED',
      [NotificationOutcomeDto.LOCALLY_SCHEDULED]: 'NOTIFICATION_SCHEDULED',
      [NotificationOutcomeDto.SCHEDULING_FAILED]: 'NOTIFICATION_SCHEDULING_FAILED',
      [NotificationOutcomeDto.CANCELLED]: 'NOTIFICATION_CANCELLED',
      [NotificationOutcomeDto.OPENED]: 'NOTIFICATION_OPENED',
      [NotificationOutcomeDto.ACTED_ON]: 'NOTIFICATION_ACTED_ON',
    } as const;
    return events[outcome];
  }

  private validateOutcome(dto: ReportNotificationAttemptDto) {
    if (dto.outcome === NotificationOutcomeDto.LOCALLY_SCHEDULED && !dto.osNotificationId) {
      throw new BadRequestException('osNotificationId is required for LOCALLY_SCHEDULED.');
    }
    if (dto.outcome === NotificationOutcomeDto.SCHEDULING_FAILED && !dto.errorCode) {
      throw new BadRequestException('errorCode is required for SCHEDULING_FAILED.');
    }
  }

  private assertQuietHoursPair(start: string | null, end: string | null) {
    if ((start === null) !== (end === null)) {
      throw new BadRequestException('quietHoursStart and quietHoursEnd must both be set or both be null.');
    }
  }

  private assertTimezone(timezone: string) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    } catch {
      throw new BadRequestException('timezone must be a valid IANA timezone.');
    }
  }

  private async claimActiveAccount(tx: Prisma.TransactionClient, userId: string) {
    const user = await tx.user.findFirst({
      where: { id: userId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new ConflictException('The account is no longer active.');
  }

  private toDevice(device: {
    id: string;
    platform: string;
    appVersion: string;
    permissionState: string;
    locale: string;
    timezone: string;
    revision: number;
    lastSeenAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: device.id,
      platform: device.platform,
      appVersion: device.appVersion,
      permissionState: device.permissionState,
      locale: device.locale,
      timezone: device.timezone,
      revision: device.revision,
      lastSeenAt: device.lastSeenAt.toISOString(),
      revokedAt: device.revokedAt?.toISOString() ?? null,
      createdAt: device.createdAt.toISOString(),
      updatedAt: device.updatedAt.toISOString(),
    };
  }

  private toPreferences(preferences: {
    userId: string;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    timezone: string;
    lockScreenPrivacy: string;
    globallyPaused: boolean;
    revision: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      userId: preferences.userId,
      quietHoursStart: preferences.quietHoursStart?.trim() ?? null,
      quietHoursEnd: preferences.quietHoursEnd?.trim() ?? null,
      timezone: preferences.timezone,
      lockScreenPrivacy: preferences.lockScreenPrivacy,
      globallyPaused: preferences.globallyPaused,
      revision: preferences.revision,
      createdAt: preferences.createdAt.toISOString(),
      updatedAt: preferences.updatedAt.toISOString(),
    };
  }

  private toAttempt(attempt: {
    id: string;
    logicalKey: string;
    occurrenceId: string;
    deviceInstallationId: string;
    scheduleRevision: number;
    effectiveScheduledAt: Date;
    nudgeStep: number;
    requestedAt: Date;
    locallyScheduledAt: Date | null;
    schedulingFailedAt: Date | null;
    cancelledAt: Date | null;
    openedAt: Date | null;
    actedOnAt: Date | null;
    osNotificationId: string | null;
    errorCode: string | null;
  }) {
    return {
      id: attempt.id,
      logicalKey: attempt.logicalKey,
      occurrenceId: attempt.occurrenceId,
      deviceInstallationId: attempt.deviceInstallationId,
      scheduleRevision: attempt.scheduleRevision,
      effectiveScheduledAt: attempt.effectiveScheduledAt.toISOString(),
      nudgeStep: attempt.nudgeStep,
      requestedAt: attempt.requestedAt.toISOString(),
      locallyScheduledAt: attempt.locallyScheduledAt?.toISOString() ?? null,
      schedulingFailedAt: attempt.schedulingFailedAt?.toISOString() ?? null,
      cancelledAt: attempt.cancelledAt?.toISOString() ?? null,
      openedAt: attempt.openedAt?.toISOString() ?? null,
      actedOnAt: attempt.actedOnAt?.toISOString() ?? null,
      osNotificationId: attempt.osNotificationId,
      errorCode: attempt.errorCode,
    };
  }

  private validateIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key) throw new BadRequestException('Idempotency-Key header is required.');
    if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/u.test(key)) {
      throw new BadRequestException(
        'Idempotency-Key must contain 8–128 letters, numbers, dots, underscores, colons, or hyphens.',
      );
    }
    return key;
  }

  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }
}
