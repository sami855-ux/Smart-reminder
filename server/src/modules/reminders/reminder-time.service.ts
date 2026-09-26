import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  EditReminderScheduleDto,
  SnoozeOccurrenceDto,
} from './dto/reminder-time.dto.js';
import { RecurringEditScopeDto } from './dto/reminder-time.dto.js';
import { ReminderScheduleService } from './reminder-schedule.service.js';
import type { ResolvedSchedule } from './reminder-schedule.service.js';

const MIN_SNOOZE_MS = 5 * 60_000;
const MAX_SNOOZE_MS = 30 * 24 * 60 * 60_000;

@Injectable()
export class ReminderTimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: ReminderScheduleService,
  ) {}

  async previewTimezoneChange(userId: string, proposedTimezone: string) {
    this.schedules.localPartsAtInstant(new Date(), proposedTimezone);
    const schedules = await this.prisma.schedule.findMany({
      where: { reminder: { userId, lifecycle: 'ACTIVE' } },
      orderBy: [{ reminderId: 'asc' }, { revision: 'desc' }],
      distinct: ['reminderId'],
      include: {
        reminder: { select: { id: true, revision: true } },
        occurrences: {
          where: { lifecycle: 'SCHEDULED' },
          orderBy: { effectiveScheduledAt: 'asc' },
          take: 1,
        },
      },
    });

    return {
      proposedTimezone,
      policy: 'PRESERVE_SCHEDULE_TIMEZONE',
      persisted: false,
      schedules: schedules.map((schedule) => {
        const next = schedule.occurrences[0];
        const instant = next?.effectiveScheduledAt ?? schedule.resolvedStartAt;
        const proposed = this.schedules.localPartsAtInstant(instant, proposedTimezone);
        return {
          reminderId: schedule.reminder.id,
          reminderRevision: schedule.reminder.revision,
          scheduleId: schedule.id,
          scheduleRevision: schedule.revision,
          original: {
            localDate: schedule.localStartDate.trim(),
            localTime: schedule.localStartTime.trim(),
            timezone: schedule.timezone,
            resolvedAt: schedule.resolvedStartAt.toISOString(),
            utcOffsetMinutes: schedule.resolvedUtcOffsetMin,
          },
          nextOccurrenceAt: instant.toISOString(),
          displayInProposedTimezone: {
            localDate: proposed.date,
            localTime: proposed.time,
            timezone: proposedTimezone,
          },
          scheduleTimezoneChanges: false,
          confirmedInstantChanges: false,
        };
      }),
    };
  }

  async materializeCurrentHorizon(userId: string, reminderId: string) {
    const schedule = await this.prisma.schedule.findFirst({
      where: { reminderId, reminder: { userId, lifecycle: 'ACTIVE' } },
      orderBy: { revision: 'desc' },
      include: {
        occurrences: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!schedule) throw new NotFoundException('Active reminder schedule not found.');
    const first = schedule.occurrences[0];
    const last = schedule.occurrences.at(-1);
    if (!first || !last) {
      throw new ConflictException('The schedule has no materialized occurrences.');
    }
    const resolved: ResolvedSchedule = {
      type: schedule.type as ResolvedSchedule['type'],
      localDate: schedule.localStartDate.trim(),
      localTime: schedule.localStartTime.trim(),
      timezone: schedule.timezone,
      weekdays: schedule.recurrenceWeekdays,
      endDate: schedule.endLocalDate?.trim() ?? null,
      occurrenceCount: schedule.occurrenceCount,
      resolvedAt: schedule.resolvedStartAt.toISOString(),
      utcOffsetMinutes: schedule.resolvedUtcOffsetMin,
      recurrenceSummary: schedule.type,
      firstOccurrence: {
        localDate: first.localDate.trim(),
        localTime: first.localTime.trim(),
        scheduledAt: first.originalScheduledAt.toISOString(),
      },
      adjustments: [],
    };
    const additions = this.schedules.materialize(resolved, {
      afterLocalDate: last.localDate.trim(),
      sequenceStart: last.sequence,
      allowEmpty: true,
    });
    if (additions.length === 0) {
      if (schedule.nextEvaluationAt !== null) {
        await this.prisma.schedule.update({
          where: { id: schedule.id },
          data: { nextEvaluationAt: null },
        });
      }
      return {
        reminderId,
        scheduleId: schedule.id,
        scheduleRevision: schedule.revision,
        createdOccurrenceCount: 0,
        materializedThrough: schedule.materializedThrough.toISOString(),
      };
    }
    const newest = additions.at(-1)!;
    const complete = !this.schedules.hasNextOccurrence(
      resolved,
      newest.localDate,
      newest.sequence,
    );
    const created = await this.prisma.$transaction(async (tx) => {
      const result = await tx.reminderOccurrence.createMany({
        data: additions.map((item) => ({
          reminderId,
          scheduleId: schedule.id,
          scheduleRevision: schedule.revision,
          sequence: item.sequence,
          occurrenceKey: this.occurrenceKey(item, schedule.timezone),
          originalScheduledAt: new Date(item.scheduledAt),
          effectiveScheduledAt: new Date(item.scheduledAt),
          localDate: item.localDate,
          localTime: item.localTime,
        })),
        skipDuplicates: true,
      });
      await tx.schedule.update({
        where: { id: schedule.id },
        data: {
          materializedThrough: new Date(newest.scheduledAt),
          nextEvaluationAt: complete ? null : new Date(newest.scheduledAt),
        },
      });
      return result.count;
    });
    return {
      reminderId,
      scheduleId: schedule.id,
      scheduleRevision: schedule.revision,
      createdOccurrenceCount: created,
      materializedThrough: newest.scheduledAt,
    };
  }

  async editSchedule(
    principal: AuthPrincipal,
    reminderId: string,
    idempotencyKey: string | undefined,
    dto: EditReminderScheduleDto,
    now = new Date(),
  ) {
    const key = this.validateIdempotencyKey(idempotencyKey);
    const requestHash = this.hash({ reminderId, ...dto });
    const replay = await this.findEvent(principal.userId, key);
    if (replay) return this.replayEdit(replay, requestHash, key);

    const reminder = await this.prisma.reminder.findFirst({
      where: { id: reminderId, userId: principal.userId, lifecycle: 'ACTIVE' },
      include: {
        schedules: { orderBy: { revision: 'desc' }, take: 1 },
        occurrences: { where: { id: dto.occurrenceId }, take: 1 },
      },
    });
    if (!reminder) throw new NotFoundException('Reminder not found.');
    const currentSchedule = reminder.schedules[0];
    const selected = reminder.occurrences[0];
    if (!currentSchedule || !selected) throw new NotFoundException('Occurrence not found.');
    if (reminder.revision !== dto.expectedReminderRevision) {
      throw new ConflictException('The reminder changed. Refresh it before editing.');
    }
    if (
      selected.lifecycle !== 'SCHEDULED' ||
      selected.effectiveScheduledAt.toISOString() !== dto.expectedEffectiveScheduledAt
    ) {
      throw new ConflictException('The occurrence changed. Refresh it before editing.');
    }

    const resolved = this.schedules.resolve(dto.schedule, now);
    if (dto.scope === RecurringEditScopeDto.THIS_OCCURRENCE) {
      return this.editOneOccurrence(
        principal,
        reminder,
        selected,
        resolved,
        key,
        requestHash,
      );
    }
    if (currentSchedule.type === 'ONE_TIME') {
      throw new BadRequestException(
        'THIS_AND_FUTURE is available only for recurring reminders.',
      );
    }
    if (selected.scheduleId !== currentSchedule.id) {
      throw new ConflictException('Only the current schedule revision can be edited.');
    }

    const materialized = this.schedules.materialize(resolved);
    const last = materialized.at(-1)!;
    const hasMoreOccurrences = this.schedules.hasNextOccurrence(
      resolved,
      last.localDate,
      last.sequence,
    );
    const nextRevision = currentSchedule.revision + 1;
    const outcome = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.reminder.updateMany({
        where: {
          id: reminder.id,
          userId: principal.userId,
          lifecycle: 'ACTIVE',
          revision: dto.expectedReminderRevision,
        },
        data: { revision: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('The reminder changed. Refresh it before editing.');
      }
      const cancelled = await tx.reminderOccurrence.updateMany({
        where: {
          scheduleId: currentSchedule.id,
          sequence: { gte: selected.sequence },
          lifecycle: 'SCHEDULED',
        },
        data: { lifecycle: 'CANCELLED', cancelledAt: now },
      });
      await tx.schedule.update({
        where: { id: currentSchedule.id },
        data: { nextEvaluationAt: null },
      });
      const replacement = await tx.schedule.create({
        data: {
          reminderId: reminder.id,
          type: resolved.type,
          localStartDate: resolved.localDate,
          localStartTime: resolved.localTime,
          timezone: resolved.timezone,
          recurrenceWeekdays: resolved.weekdays,
          ...(resolved.endDate ? { endLocalDate: resolved.endDate } : {}),
          ...(resolved.occurrenceCount
            ? { occurrenceCount: resolved.occurrenceCount }
            : {}),
          resolvedStartAt: new Date(resolved.resolvedAt),
          resolvedUtcOffsetMin: resolved.utcOffsetMinutes,
          revision: nextRevision,
          materializedThrough: new Date(last.scheduledAt),
          nextEvaluationAt: hasMoreOccurrences ? new Date(last.scheduledAt) : null,
          supersededScheduleId: currentSchedule.id,
        },
      });
      await tx.reminderOccurrence.createMany({
        data: materialized.map((item) => ({
          reminderId: reminder.id,
          scheduleId: replacement.id,
          scheduleRevision: nextRevision,
          sequence: item.sequence,
          occurrenceKey: this.occurrenceKey(item, resolved.timezone),
          originalScheduledAt: new Date(item.scheduledAt),
          effectiveScheduledAt: new Date(item.scheduledAt),
          localDate: item.localDate,
          localTime: item.localTime,
        })),
      });
      const event = await tx.reminderEvent.create({
        data: {
          userId: principal.userId,
          reminderId: reminder.id,
          occurrenceId: selected.id,
          actorType: 'USER',
          actorId: principal.userId,
          type: 'SCHEDULE_REVISED',
          idempotencyKey: key,
          requestHash,
          metadata: {
            scope: dto.scope,
            supersededScheduleRevision: currentSchedule.revision,
            scheduleRevision: nextRevision,
            cancelledOccurrenceCount: cancelled.count,
            materializedOccurrenceCount: materialized.length,
          },
        },
      });
      return { eventId: event.id, cancelledCount: cancelled.count, scheduleId: replacement.id };
    });

    return {
      reminderId: reminder.id,
      reminderRevision: dto.expectedReminderRevision + 1,
      scope: dto.scope,
      scheduleId: outcome.scheduleId,
      scheduleRevision: nextRevision,
      supersededScheduleId: currentSchedule.id,
      preservedHistoricalOccurrences: selected.sequence - 1,
      cancelledFutureOccurrences: outcome.cancelledCount,
      materializedOccurrenceCount: materialized.length,
      firstOccurrence: materialized[0],
      eventId: outcome.eventId,
      idempotency: { key, replayed: false },
    };
  }

  async snooze(
    principal: AuthPrincipal,
    occurrenceId: string,
    idempotencyKey: string | undefined,
    dto: SnoozeOccurrenceDto,
    now = new Date(),
  ) {
    const key = this.validateIdempotencyKey(idempotencyKey);
    const until = new Date(dto.until);
    const delay = until.getTime() - now.getTime();
    if (delay < MIN_SNOOZE_MS || delay > MAX_SNOOZE_MS) {
      throw new BadRequestException('Snooze must be between 5 minutes and 30 days ahead.');
    }
    const requestHash = this.hash({ occurrenceId, ...dto });
    const replay = await this.findEvent(principal.userId, key);
    if (replay) {
      return this.replaySnooze(
        replay,
        requestHash,
        occurrenceId,
        principal.userId,
        key,
      );
    }

    const occurrence = await this.prisma.reminderOccurrence.findFirst({
      where: { id: occurrenceId, reminder: { userId: principal.userId } },
      include: { reminder: { select: { id: true } } },
    });
    if (!occurrence) throw new NotFoundException('Occurrence not found.');
    if (
      occurrence.lifecycle !== 'SCHEDULED' ||
      occurrence.scheduleRevision !== dto.expectedScheduleRevision ||
      occurrence.effectiveScheduledAt.toISOString() !== dto.expectedEffectiveScheduledAt
    ) {
      throw new ConflictException('The occurrence changed. Refresh it before snoozing.');
    }
    const local = await this.prisma.schedule.findUnique({
      where: { id: occurrence.scheduleId },
      select: { timezone: true },
    });
    if (!local) throw new ConflictException('The occurrence schedule is unavailable.');
    const effectiveLocal = this.schedules.localPartsAtInstant(until, local.timezone);

    const eventId = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.reminderOccurrence.updateMany({
        where: {
          id: occurrence.id,
          lifecycle: 'SCHEDULED',
          scheduleRevision: dto.expectedScheduleRevision,
          effectiveScheduledAt: new Date(dto.expectedEffectiveScheduledAt),
        },
        data: {
          effectiveScheduledAt: until,
          localDate: effectiveLocal.date,
          localTime: effectiveLocal.time,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('The occurrence changed. Refresh it before snoozing.');
      }
      const event = await tx.reminderEvent.create({
        data: {
          userId: principal.userId,
          reminderId: occurrence.reminder.id,
          occurrenceId: occurrence.id,
          actorType: 'USER',
          actorId: principal.userId,
          type: 'OCCURRENCE_SNOOZED',
          idempotencyKey: key,
          requestHash,
          metadata: {
            scheduleRevision: occurrence.scheduleRevision,
            previousEffectiveScheduledAt: occurrence.effectiveScheduledAt.toISOString(),
            effectiveScheduledAt: until.toISOString(),
          },
        },
      });
      return event.id;
    });

    return {
      occurrenceId: occurrence.id,
      scheduleRevision: occurrence.scheduleRevision,
      originalScheduledAt: occurrence.originalScheduledAt.toISOString(),
      previousEffectiveScheduledAt: occurrence.effectiveScheduledAt.toISOString(),
      effectiveScheduledAt: until.toISOString(),
      timezone: local.timezone,
      localDate: effectiveLocal.date,
      localTime: effectiveLocal.time,
      laterOccurrencesChanged: false,
      eventId,
      idempotency: { key, replayed: false },
    };
  }

  private async editOneOccurrence(
    principal: AuthPrincipal,
    reminder: { id: string; revision: number },
    occurrence: {
      id: string;
      scheduleRevision: number;
      originalScheduledAt: Date;
      effectiveScheduledAt: Date;
    },
    resolved: ReturnType<ReminderScheduleService['resolve']>,
    key: string,
    requestHash: string,
  ) {
    const scheduledAt = new Date(resolved.firstOccurrence.scheduledAt);
    const eventId = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.reminderOccurrence.updateMany({
        where: {
          id: occurrence.id,
          lifecycle: 'SCHEDULED',
          effectiveScheduledAt: occurrence.effectiveScheduledAt,
        },
        data: {
          effectiveScheduledAt: scheduledAt,
          localDate: resolved.firstOccurrence.localDate,
          localTime: resolved.firstOccurrence.localTime,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('The occurrence changed. Refresh it before editing.');
      }
      const event = await tx.reminderEvent.create({
        data: {
          userId: principal.userId,
          reminderId: reminder.id,
          occurrenceId: occurrence.id,
          actorType: 'USER',
          actorId: principal.userId,
          type: 'OCCURRENCE_RESCHEDULED',
          idempotencyKey: key,
          requestHash,
          metadata: {
            scope: RecurringEditScopeDto.THIS_OCCURRENCE,
            scheduleRevision: occurrence.scheduleRevision,
            previousEffectiveScheduledAt: occurrence.effectiveScheduledAt.toISOString(),
            effectiveScheduledAt: scheduledAt.toISOString(),
          },
        },
      });
      return event.id;
    });
    return {
      reminderId: reminder.id,
      reminderRevision: reminder.revision,
      occurrenceId: occurrence.id,
      scope: RecurringEditScopeDto.THIS_OCCURRENCE,
      scheduleRevision: occurrence.scheduleRevision,
      originalScheduledAt: occurrence.originalScheduledAt.toISOString(),
      effectiveScheduledAt: scheduledAt.toISOString(),
      localDate: resolved.firstOccurrence.localDate,
      localTime: resolved.firstOccurrence.localTime,
      laterOccurrencesChanged: false,
      eventId,
      idempotency: { key, replayed: false },
    };
  }

  private async findEvent(userId: string, key: string) {
    return this.prisma.reminderEvent.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
    });
  }

  private replayEdit(
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

  private async replaySnooze(
    event: { id: string; reminderId: string; requestHash: string | null },
    requestHash: string,
    occurrenceId: string,
    userId: string,
    key: string,
  ) {
    this.assertReplayHash(event.requestHash, requestHash);
    const occurrence = await this.prisma.reminderOccurrence.findFirst({
      where: { id: occurrenceId, reminder: { userId } },
      include: { schedule: { select: { timezone: true } } },
    });
    return {
      occurrenceId,
      reminderId: event.reminderId,
      effectiveScheduledAt: occurrence?.effectiveScheduledAt.toISOString() ?? null,
      timezone: occurrence?.schedule.timezone ?? null,
      laterOccurrencesChanged: false,
      eventId: event.id,
      idempotency: { key, replayed: true },
    };
  }

  private assertReplayHash(stored: string | null, incoming: string): void {
    if (!stored || stored !== incoming) {
      throw new ConflictException(
        'This idempotency key was already used with a different request.',
      );
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

  private occurrenceKey(
    occurrence: { sequence: number; localDate: string; localTime: string },
    timezone: string,
  ): string {
    return `${occurrence.localDate}T${occurrence.localTime}[${timezone}]#${occurrence.sequence}`;
  }
}
