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
import type {
  DeleteReminderDto,
  OccurrenceActionDto,
  UpdateNudgePolicyDto,
  UpdateReminderContentDto,
} from './dto/reminder-action.dto.js';
import { ReminderAutomationService } from './reminder-automation.service.js';

type TerminalAction = 'complete' | 'skip';
type TerminalLifecycle = 'COMPLETED' | 'SKIPPED';
type TerminalEvent = 'OCCURRENCE_COMPLETED' | 'OCCURRENCE_SKIPPED';

@Injectable()
export class ReminderActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automations: ReminderAutomationService,
  ) {}

  complete(
    principal: AuthPrincipal,
    occurrenceId: string,
    idempotencyKey: string | undefined,
    dto: OccurrenceActionDto,
    now = new Date(),
  ) {
    return this.transitionOccurrence(principal, occurrenceId, idempotencyKey, dto, 'complete', now);
  }

  skip(
    principal: AuthPrincipal,
    occurrenceId: string,
    idempotencyKey: string | undefined,
    dto: OccurrenceActionDto,
    now = new Date(),
  ) {
    return this.transitionOccurrence(principal, occurrenceId, idempotencyKey, dto, 'skip', now);
  }

  async updateContent(
    principal: AuthPrincipal,
    reminderId: string,
    idempotencyKey: string | undefined,
    dto: UpdateReminderContentDto,
    now = new Date(),
  ) {
    const key = this.validateIdempotencyKey(idempotencyKey);
    if (dto.title === undefined && dto.contextNote === undefined) {
      throw new BadRequestException('At least one of title or contextNote must be provided.');
    }
    const requestHash = this.hash({ action: 'update-content', reminderId, ...dto });
    const replay = await this.findEvent(principal.userId, key);
    if (replay) return this.replayReminderMutation(replay, requestHash, key);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await this.claimActiveAccount(tx, principal.userId);
        const current = await tx.reminder.findFirst({
          where: { id: reminderId, userId: principal.userId },
          select: { id: true, lifecycle: true, revision: true },
        });
        if (!current) throw new NotFoundException('Reminder not found.');
        if (current.lifecycle !== 'ACTIVE' || current.revision !== dto.expectedRevision) {
          this.throwReminderConflict(current);
        }
        const updated = await tx.reminder.updateMany({
          where: {
            id: reminderId,
            userId: principal.userId,
            lifecycle: 'ACTIVE',
            revision: dto.expectedRevision,
          },
          data: {
            ...(dto.title !== undefined ? { title: dto.title } : {}),
            ...(dto.contextNote !== undefined ? { contextNote: dto.contextNote } : {}),
            revision: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          const latest = await tx.reminder.findFirst({
            where: { id: reminderId, userId: principal.userId },
            select: { id: true, lifecycle: true, revision: true },
          });
          this.throwReminderConflict(latest);
        }
        await tx.notificationAttempt.updateMany({
          where: { reminderId, cancelledAt: null },
          data: { cancelledAt: now },
        });
        const event = await tx.reminderEvent.create({
          data: {
            userId: principal.userId,
            reminderId,
            actorType: 'USER',
            actorId: principal.userId,
            type: 'REMINDER_UPDATED',
            idempotencyKey: key,
            requestHash,
            metadata: {
              changedFields: [
                ...(dto.title !== undefined ? ['title'] : []),
                ...(dto.contextNote !== undefined ? ['contextNote'] : []),
              ],
              reminderRevision: dto.expectedRevision + 1,
            },
          },
        });
        return { eventId: event.id, revision: dto.expectedRevision + 1 };
      }, { isolationLevel: 'Serializable' });
      return {
        reminderId,
        revision: result.revision,
        eventId: result.eventId,
        idempotency: { key, replayed: false },
      };
    } catch (error) {
      return this.replayAfterUniqueRace(error, principal.userId, key, requestHash);
    }
  }

  async deleteReminder(
    principal: AuthPrincipal,
    reminderId: string,
    idempotencyKey: string | undefined,
    dto: DeleteReminderDto,
    now = new Date(),
  ) {
    const key = this.validateIdempotencyKey(idempotencyKey);
    const requestHash = this.hash({ action: 'delete', reminderId, ...dto });
    const replay = await this.findEvent(principal.userId, key);
    if (replay) return this.replayReminderMutation(replay, requestHash, key);
    const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60_000);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await this.claimActiveAccount(tx, principal.userId);
        const current = await tx.reminder.findFirst({
          where: { id: reminderId, userId: principal.userId },
          select: { id: true, lifecycle: true, revision: true },
        });
        if (!current) throw new NotFoundException('Reminder not found.');
        if (current.lifecycle !== 'ACTIVE' || current.revision !== dto.expectedRevision) {
          this.throwReminderConflict(current);
        }
        const claimed = await tx.reminder.updateMany({
          where: {
            id: reminderId,
            userId: principal.userId,
            lifecycle: 'ACTIVE',
            revision: dto.expectedRevision,
          },
          data: {
            lifecycle: 'CANCELLED',
            revision: { increment: 1 },
            deletedAt: now,
            purgeAfter,
          },
        });
        if (claimed.count !== 1) {
          const latest = await tx.reminder.findFirst({
            where: { id: reminderId, userId: principal.userId },
            select: { id: true, lifecycle: true, revision: true },
          });
          this.throwReminderConflict(latest);
        }
        const cancelled = await tx.reminderOccurrence.updateMany({
          where: { reminderId, lifecycle: 'SCHEDULED' },
          data: { lifecycle: 'CANCELLED', cancelledAt: now },
        });
        await tx.schedule.updateMany({ where: { reminderId }, data: { nextEvaluationAt: null } });
        await tx.contextTrigger.updateMany({
          where: { reminderId, lifecycle: 'ACTIVE' },
          data: { lifecycle: 'PAUSED', unavailableReason: 'REMINDER_DELETED', revision: { increment: 1 } },
        });
        const workflowIds = (
          await tx.reminderWorkflow.findMany({
            where: { sourceReminderId: reminderId, lifecycle: { in: ['ACTIVE', 'PAUSED'] } },
            select: { id: true },
          })
        ).map((workflow) => workflow.id);
        await tx.reminderWorkflow.updateMany({
          where: { id: { in: workflowIds } },
          data: { lifecycle: 'CANCELLED', revision: { increment: 1 } },
        });
        await tx.workflowRun.updateMany({
          where: { workflowId: { in: workflowIds }, lifecycle: 'ACTIVE' },
          data: { lifecycle: 'STOPPED', completedAt: now },
        });
        await tx.nudgePolicy.updateMany({
          where: { reminderId, invalidatedAt: null },
          data: { invalidatedAt: now, invalidationReason: 'REMINDER_DELETED' },
        });
        await tx.notificationAttempt.updateMany({
          where: { reminderId, cancelledAt: null },
          data: { cancelledAt: now },
        });
        const event = await tx.reminderEvent.create({
          data: {
            userId: principal.userId,
            reminderId,
            actorType: 'USER',
            actorId: principal.userId,
            type: 'REMINDER_DELETED',
            idempotencyKey: key,
            requestHash,
            metadata: {
              reminderRevision: dto.expectedRevision + 1,
              cancelledOccurrenceCount: cancelled.count,
              purgeAfter: purgeAfter.toISOString(),
            },
          },
        });
        return { eventId: event.id, cancelledOccurrenceCount: cancelled.count };
      }, { isolationLevel: 'Serializable' });
      return {
        reminderId,
        lifecycle: 'CANCELLED' as const,
        revision: dto.expectedRevision + 1,
        purgeAfter: purgeAfter.toISOString(),
        cancelledOccurrenceCount: result.cancelledOccurrenceCount,
        eventId: result.eventId,
        idempotency: { key, replayed: false },
      };
    } catch (error) {
      return this.replayAfterUniqueRace(error, principal.userId, key, requestHash);
    }
  }

  async getNudgePolicy(userId: string, reminderId: string) {
    const reminder = await this.prisma.reminder.findFirst({
      where: { id: reminderId, userId },
      include: {
        schedules: {
          orderBy: { revision: 'desc' },
          take: 1,
          include: { nudgePolicy: true },
        },
      },
    });
    if (!reminder) throw new NotFoundException('Reminder not found.');
    const schedule = reminder.schedules[0];
    if (!schedule) throw new ConflictException('The reminder schedule is incomplete.');
    return this.toNudgeResponse(reminder.id, reminder.revision, schedule.id, schedule.revision, schedule.nudgePolicy);
  }

  async updateNudgePolicy(
    principal: AuthPrincipal,
    reminderId: string,
    idempotencyKey: string | undefined,
    dto: UpdateNudgePolicyDto,
  ) {
    const key = this.validateIdempotencyKey(idempotencyKey);
    const requestHash = this.hash({ action: 'nudge-policy', reminderId, ...dto });
    const replay = await this.findEvent(principal.userId, key);
    if (replay) return this.replayReminderMutation(replay, requestHash, key);
    const intervalMinutes = dto.enabled ? dto.intervalMinutes : undefined;
    if (dto.enabled && intervalMinutes === undefined) {
      throw new BadRequestException('intervalMinutes is required when a nudge is enabled.');
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await this.claimActiveAccount(tx, principal.userId);
        const reminder = await tx.reminder.findFirst({
          where: { id: reminderId, userId: principal.userId },
          include: { schedules: { orderBy: { revision: 'desc' }, take: 1 } },
        });
        if (!reminder) throw new NotFoundException('Reminder not found.');
        if (reminder.lifecycle !== 'ACTIVE' || reminder.revision !== dto.expectedReminderRevision) {
          this.throwReminderConflict(reminder);
        }
        const schedule = reminder.schedules[0];
        if (!schedule) throw new ConflictException('The reminder schedule is incomplete.');
        const claimed = await tx.reminder.updateMany({
          where: {
            id: reminder.id,
            userId: principal.userId,
            lifecycle: 'ACTIVE',
            revision: dto.expectedReminderRevision,
          },
          data: { revision: { increment: 1 } },
        });
        if (claimed.count !== 1) this.throwReminderConflict(reminder);
        const policy = await tx.nudgePolicy.upsert({
          where: { scheduleId: schedule.id },
          create: {
            reminderId: reminder.id,
            scheduleId: schedule.id,
            scheduleRevision: schedule.revision,
            enabled: dto.enabled,
            intervalMinutes: intervalMinutes ?? null,
          },
          update: {
            enabled: dto.enabled,
            intervalMinutes: intervalMinutes ?? null,
            invalidatedAt: null,
            invalidationReason: null,
          },
        });
        const event = await tx.reminderEvent.create({
          data: {
            userId: principal.userId,
            reminderId: reminder.id,
            actorType: 'USER',
            actorId: principal.userId,
            type: 'NUDGE_POLICY_UPDATED',
            idempotencyKey: key,
            requestHash,
            metadata: {
              enabled: policy.enabled,
              intervalMinutes: policy.intervalMinutes,
              scheduleRevision: schedule.revision,
              reminderRevision: dto.expectedReminderRevision + 1,
            },
          },
        });
        return { schedule, policy, eventId: event.id };
      }, { isolationLevel: 'Serializable' });
      return {
        ...this.toNudgeResponse(
          reminderId,
          dto.expectedReminderRevision + 1,
          result.schedule.id,
          result.schedule.revision,
          result.policy,
        ),
        eventId: result.eventId,
        idempotency: { key, replayed: false },
      };
    } catch (error) {
      return this.replayAfterUniqueRace(error, principal.userId, key, requestHash);
    }
  }

  async listEvents(userId: string, reminderId: string, limit: number, cursor?: string) {
    const owned = await this.prisma.reminder.findFirst({
      where: { id: reminderId, userId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Reminder not found.');
    const decoded = cursor ? this.decodeEventCursor(cursor) : null;
    const rows = await this.prisma.reminderEvent.findMany({
      where: {
        reminderId,
        userId,
        ...(decoded
          ? {
              OR: [
                { createdAt: { lt: decoded.at } },
                { createdAt: decoded.at, id: { lt: decoded.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items: items.map((event) => ({
        id: event.id,
        reminderId: event.reminderId,
        occurrenceId: event.occurrenceId,
        actorType: event.actorType,
        type: event.type,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString(),
      })),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(JSON.stringify({ at: last.createdAt.toISOString(), id: last.id })).toString('base64url')
          : null,
    };
  }

  async explainOccurrence(userId: string, occurrenceId: string) {
    const occurrence = await this.prisma.reminderOccurrence.findFirst({
      where: { id: occurrenceId, reminder: { userId } },
      include: {
        schedule: { include: { nudgePolicy: true } },
        reminder: { select: { id: true, revision: true, lifecycle: true } },
      },
    });
    if (!occurrence) throw new NotFoundException('Occurrence not found.');
    const wasMoved =
      occurrence.effectiveScheduledAt.getTime() !== occurrence.originalScheduledAt.getTime();
    const reason = wasMoved
      ? `Rescheduled for ${occurrence.localDate.trim()} at ${occurrence.localTime.trim()} in ${occurrence.schedule.timezone}.`
      : `Scheduled for ${occurrence.localDate.trim()} at ${occurrence.localTime.trim()} in ${occurrence.schedule.timezone}.`;
    return {
      occurrenceId: occurrence.id,
      reminderId: occurrence.reminder.id,
      reminderRevision: occurrence.reminder.revision,
      reminderLifecycle: occurrence.reminder.lifecycle,
      lifecycle: occurrence.lifecycle,
      scheduleRevision: occurrence.scheduleRevision,
      originalScheduledAt: occurrence.originalScheduledAt.toISOString(),
      effectiveScheduledAt: occurrence.effectiveScheduledAt.toISOString(),
      reason,
      nudge: {
        enabled:
          occurrence.schedule.nudgePolicy?.enabled === true &&
          occurrence.schedule.nudgePolicy.invalidatedAt === null,
        intervalMinutes: occurrence.schedule.nudgePolicy?.intervalMinutes ?? null,
      },
    };
  }

  private async transitionOccurrence(
    principal: AuthPrincipal,
    occurrenceId: string,
    idempotencyKey: string | undefined,
    dto: OccurrenceActionDto,
    action: TerminalAction,
    now = new Date(),
  ) {
    const key = this.validateIdempotencyKey(idempotencyKey);
    const requestHash = this.hash({ action, occurrenceId, ...dto });
    const replay = await this.findEvent(principal.userId, key);
    if (replay) return this.replayOccurrenceMutation(replay, requestHash, occurrenceId, principal.userId, key);

    const targetLifecycle: TerminalLifecycle = action === 'complete' ? 'COMPLETED' : 'SKIPPED';
    const eventType: TerminalEvent = action === 'complete' ? 'OCCURRENCE_COMPLETED' : 'OCCURRENCE_SKIPPED';
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await this.claimActiveAccount(tx, principal.userId);
        const occurrence = await tx.reminderOccurrence.findFirst({
          where: { id: occurrenceId, reminder: { userId: principal.userId } },
          include: {
            reminder: { select: { id: true, lifecycle: true } },
            schedule: { select: { type: true, nextEvaluationAt: true } },
          },
        });
        if (!occurrence) throw new NotFoundException('Occurrence not found.');
        if (action === 'complete' && occurrence.effectiveScheduledAt > now) {
          throw new ConflictException({
            code: 'OCCURRENCE_NOT_DUE',
            message: 'Only a due or overdue occurrence can be completed.',
            details: this.occurrenceConflictDetails(occurrence),
          });
        }
        if (action === 'skip' && occurrence.schedule.type === 'ONE_TIME') {
          throw new ConflictException({
            code: 'OCCURRENCE_NOT_RECURRING',
            message: 'Only a recurring occurrence can be skipped.',
            details: this.occurrenceConflictDetails(occurrence),
          });
        }
        if (
          occurrence.reminder.lifecycle !== 'ACTIVE' ||
          occurrence.lifecycle !== 'SCHEDULED' ||
          occurrence.scheduleRevision !== dto.expectedScheduleRevision ||
          occurrence.effectiveScheduledAt.toISOString() !== dto.expectedEffectiveScheduledAt
        ) {
          this.throwOccurrenceConflict(occurrence);
        }
        const claimed = await tx.reminderOccurrence.updateMany({
          where: {
            id: occurrence.id,
            lifecycle: 'SCHEDULED',
            scheduleRevision: dto.expectedScheduleRevision,
            effectiveScheduledAt: new Date(dto.expectedEffectiveScheduledAt),
          },
          data: {
            lifecycle: targetLifecycle,
            ...(targetLifecycle === 'COMPLETED' ? { completedAt: now } : { skippedAt: now }),
          },
        });
        if (claimed.count !== 1) {
          const latest = await tx.reminderOccurrence.findUnique({ where: { id: occurrence.id } });
          this.throwOccurrenceConflict(latest);
        }
        await tx.notificationAttempt.updateMany({
          where: { occurrenceId: occurrence.id, cancelledAt: null },
          data: { cancelledAt: now, ...(action === 'complete' ? { actedOnAt: now } : {}) },
        });
        const remaining = await tx.reminderOccurrence.count({
          where: { reminderId: occurrence.reminderId, lifecycle: 'SCHEDULED' },
        });
        const archived = remaining === 0 && occurrence.schedule.nextEvaluationAt === null;
        if (archived) {
          await tx.reminder.updateMany({
            where: { id: occurrence.reminderId, lifecycle: 'ACTIVE' },
            data: { lifecycle: 'ARCHIVED', revision: { increment: 1 } },
          });
        }
        const event = await tx.reminderEvent.create({
          data: {
            userId: principal.userId,
            reminderId: occurrence.reminderId,
            occurrenceId: occurrence.id,
            actorType: 'USER',
            actorId: principal.userId,
            type: eventType,
            idempotencyKey: key,
            requestHash,
            metadata: {
              lifecycle: targetLifecycle,
              scheduleRevision: occurrence.scheduleRevision,
              archivedReminder: archived,
            },
          },
        });
        const activatedReminders = await this.automations.advanceWithinTransaction(
          tx,
          principal.userId,
          occurrence,
          targetLifecycle,
          now,
        );
        return { occurrence, eventId: event.id, archived, activatedReminders };
      }, { isolationLevel: 'Serializable' });
      return {
        occurrenceId,
        reminderId: result.occurrence.reminderId,
        lifecycle: targetLifecycle,
        effectiveScheduledAt: result.occurrence.effectiveScheduledAt.toISOString(),
        reminderLifecycle: result.archived ? 'ARCHIVED' : 'ACTIVE',
        eventId: result.eventId,
        activatedReminders: result.activatedReminders,
        idempotency: { key, replayed: false },
      };
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const raced = await this.findEvent(principal.userId, key);
      if (!raced) throw error;
      return this.replayOccurrenceMutation(raced, requestHash, occurrenceId, principal.userId, key);
    }
  }

  private async claimActiveAccount(tx: Prisma.TransactionClient, userId: string) {
    const user = await tx.user.findFirst({
      where: { id: userId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new ConflictException('The account is no longer active.');
  }

  private findEvent(userId: string, key: string) {
    return this.prisma.reminderEvent.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
    });
  }

  private replayReminderMutation(
    event: { id: string; reminderId: string; requestHash: string | null; metadata: unknown },
    requestHash: string,
    key: string,
  ) {
    this.assertReplayHash(event.requestHash, requestHash);
    return {
      reminderId: event.reminderId,
      eventId: event.id,
      result: event.metadata,
      idempotency: { key, replayed: true },
    };
  }

  private async replayAfterUniqueRace(
    error: unknown,
    userId: string,
    key: string,
    requestHash: string,
  ) {
    if (!this.isUniqueConstraintError(error)) throw error;
    const raced = await this.findEvent(userId, key);
    if (!raced) throw error;
    return this.replayReminderMutation(raced, requestHash, key);
  }

  private async replayOccurrenceMutation(
    event: { id: string; reminderId: string; requestHash: string | null },
    requestHash: string,
    occurrenceId: string,
    userId: string,
    key: string,
  ) {
    this.assertReplayHash(event.requestHash, requestHash);
    const occurrence = await this.prisma.reminderOccurrence.findFirst({
      where: { id: occurrenceId, reminder: { userId } },
      include: { reminder: { select: { lifecycle: true } } },
    });
    return {
      occurrenceId,
      reminderId: event.reminderId,
      lifecycle: occurrence?.lifecycle ?? null,
      effectiveScheduledAt: occurrence?.effectiveScheduledAt.toISOString() ?? null,
      reminderLifecycle: occurrence?.reminder.lifecycle ?? null,
      eventId: event.id,
      idempotency: { key, replayed: true },
    };
  }

  private toNudgeResponse(
    reminderId: string,
    reminderRevision: number,
    scheduleId: string,
    scheduleRevision: number,
    policy: {
      enabled: boolean;
      intervalMinutes: number | null;
      invalidatedAt: Date | null;
      invalidationReason: string | null;
    } | null,
  ) {
    return {
      reminderId,
      reminderRevision,
      scheduleId,
      scheduleRevision,
      enabled: policy?.enabled ?? false,
      intervalMinutes: policy?.intervalMinutes ?? null,
      invalidatedAt: policy?.invalidatedAt?.toISOString() ?? null,
      invalidationReason: policy?.invalidationReason ?? null,
    };
  }

  private occurrenceConflictDetails(occurrence: {
    id: string;
    lifecycle: string;
    scheduleRevision: number;
    effectiveScheduledAt: Date;
  }) {
    return {
      occurrenceId: occurrence.id,
      lifecycle: occurrence.lifecycle,
      scheduleRevision: occurrence.scheduleRevision,
      effectiveScheduledAt: occurrence.effectiveScheduledAt.toISOString(),
    };
  }

  private throwOccurrenceConflict(
    occurrence:
      | { id: string; lifecycle: string; scheduleRevision: number; effectiveScheduledAt: Date }
      | null,
  ): never {
    throw new ConflictException({
      code: 'OCCURRENCE_STATE_CONFLICT',
      message: 'The occurrence changed. Refresh it before applying this action.',
      ...(occurrence ? { details: this.occurrenceConflictDetails(occurrence) } : {}),
    });
  }

  private throwReminderConflict(
    reminder: { id: string; lifecycle: string; revision: number } | null,
  ): never {
    throw new ConflictException({
      code: 'REMINDER_STATE_CONFLICT',
      message: 'The reminder changed. Refresh it before applying this action.',
      ...(reminder
        ? { details: { reminderId: reminder.id, lifecycle: reminder.lifecycle, revision: reminder.revision } }
        : {}),
    });
  }

  private assertReplayHash(stored: string | null, incoming: string) {
    if (!stored || stored !== incoming) {
      throw new ConflictException('This idempotency key was already used with a different request.');
    }
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

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private decodeEventCursor(value: string): { at: Date; id: string } {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
        at?: unknown;
        id?: unknown;
      };
      if (
        typeof parsed.at !== 'string' ||
        Number.isNaN(new Date(parsed.at).getTime()) ||
        typeof parsed.id !== 'string' ||
        !/^[0-9a-f-]{36}$/iu.test(parsed.id)
      ) {
        throw new Error('invalid cursor');
      }
      return { at: new Date(parsed.at), id: parsed.id };
    } catch {
      throw new BadRequestException('cursor is invalid.');
    }
  }
}
