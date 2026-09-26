import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  CreateReminderDto,
  PreviewReminderDto,
} from './dto/reminder-create.dto.js';
import type { ListReminderOccurrencesDto } from './dto/reminder-query.dto.js';
import { ReminderScheduleService } from './reminder-schedule.service.js';

const reminderInclude = {
  schedules: { orderBy: { revision: 'desc' as const }, take: 1 },
  occurrences: { orderBy: { effectiveScheduledAt: 'asc' as const }, take: 1 },
} as const;

type ReminderRecord = Prisma.ReminderGetPayload<{ include: typeof reminderInclude }>;

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: ReminderScheduleService,
  ) {}

  preview(dto: PreviewReminderDto, now = new Date()) {
    const schedule = this.schedules.resolve(dto.schedule, now);
    return {
      title: dto.title,
      contextNote: dto.contextNote ?? null,
      schedule,
      requiresConfirmation: true,
      persisted: false,
    };
  }

  async listOccurrences(userId: string, query: ListReminderOccurrencesDto) {
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const from = query.from ? new Date(query.from) : new Date();
    const to = query.to ? new Date(query.to) : null;
    if (to && to <= from) {
      throw new BadRequestException('to must be later than from.');
    }

    const rows = await this.prisma.reminderOccurrence.findMany({
      where: {
        lifecycle: 'SCHEDULED',
        reminder: { userId, lifecycle: 'ACTIVE' },
        effectiveScheduledAt: {
          gte: from,
          ...(to ? { lte: to } : {}),
        },
        ...(cursor
          ? {
              OR: [
                { effectiveScheduledAt: { gt: cursor.at } },
                { effectiveScheduledAt: cursor.at, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ effectiveScheduledAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      include: {
        reminder: {
          select: { id: true, title: true, contextNote: true, revision: true },
        },
        schedule: {
          select: {
            id: true,
            type: true,
            timezone: true,
            recurrenceWeekdays: true,
            revision: true,
          },
        },
      },
    });
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);

    return {
      items: items.map((item) => ({
        id: item.id,
        reminderId: item.reminder.id,
        title: item.reminder.title,
        contextNote: item.reminder.contextNote,
        reminderRevision: item.reminder.revision,
        scheduleId: item.schedule.id,
        scheduleRevision: item.scheduleRevision,
        scheduleType: item.schedule.type,
        timezone: item.schedule.timezone,
        weekdays: item.schedule.recurrenceWeekdays,
        sequence: item.sequence,
        lifecycle: item.lifecycle,
        localDate: item.localDate.trim(),
        localTime: item.localTime.trim(),
        originalScheduledAt: item.originalScheduledAt.toISOString(),
        effectiveScheduledAt: item.effectiveScheduledAt.toISOString(),
      })),
      nextCursor:
        hasMore && last
          ? this.encodeCursor(last.effectiveScheduledAt, last.id)
          : null,
    };
  }

  async getReminder(userId: string, reminderId: string) {
    const reminder = await this.prisma.reminder.findFirst({
      where: { id: reminderId, userId },
      include: {
        schedules: { orderBy: { revision: 'desc' }, take: 1 },
        occurrences: {
          orderBy: [{ effectiveScheduledAt: 'asc' }, { id: 'asc' }],
          take: 128,
        },
      },
    });
    if (!reminder) throw new NotFoundException('Reminder not found.');
    const schedule = reminder.schedules[0];
    if (!schedule) throw new ConflictException('The reminder schedule is incomplete.');

    return {
      id: reminder.id,
      title: reminder.title,
      contextNote: reminder.contextNote,
      lifecycle: reminder.lifecycle,
      revision: reminder.revision,
      schedule: {
        id: schedule.id,
        type: schedule.type,
        localDate: schedule.localStartDate.trim(),
        localTime: schedule.localStartTime.trim(),
        timezone: schedule.timezone,
        weekdays: schedule.recurrenceWeekdays,
        endDate: schedule.endLocalDate?.trim() ?? null,
        occurrenceCount: schedule.occurrenceCount,
        resolvedAt: schedule.resolvedStartAt.toISOString(),
        utcOffsetMinutes: schedule.resolvedUtcOffsetMin,
        revision: schedule.revision,
        materializedThrough: schedule.materializedThrough.toISOString(),
      },
      occurrences: reminder.occurrences.map((occurrence) => ({
        id: occurrence.id,
        scheduleId: occurrence.scheduleId,
        scheduleRevision: occurrence.scheduleRevision,
        sequence: occurrence.sequence,
        lifecycle: occurrence.lifecycle,
        localDate: occurrence.localDate.trim(),
        localTime: occurrence.localTime.trim(),
        originalScheduledAt: occurrence.originalScheduledAt.toISOString(),
        effectiveScheduledAt: occurrence.effectiveScheduledAt.toISOString(),
      })),
      createdAt: reminder.createdAt.toISOString(),
      updatedAt: reminder.updatedAt.toISOString(),
    };
  }

  async create(
    principal: AuthPrincipal,
    idempotencyKey: string | undefined,
    dto: CreateReminderDto,
    now = new Date(),
  ) {
    const key = this.validateIdempotencyKey(idempotencyKey);
    const canonicalWeekdays = [...new Set((dto.schedule.weekdays ?? []).map(Number))].sort(
      (left, right) => left - right,
    );
    const requestHash = this.requestHash(dto, canonicalWeekdays);
    const existing = await this.findCreateRequest(principal.userId, key);
    if (existing) {
      return this.replay(existing.requestHash, requestHash, existing.reminder, key);
    }
    const schedule = this.schedules.resolve(dto.schedule, now);
    const confirmedResolvedAt = new Date(dto.confirmedResolvedAt).toISOString();
    if (confirmedResolvedAt !== schedule.resolvedAt) {
      throw new ConflictException(
        'The resolved schedule differs from the confirmed preview. Preview it again before saving.',
      );
    }
    const occurrences = this.schedules.materialize(schedule);
    const lastOccurrence = occurrences.at(-1)!;
    const hasMoreOccurrences = this.schedules.hasNextOccurrence(
      schedule,
      lastOccurrence.localDate,
      lastOccurrence.sequence,
    );

    try {
      const reminderId = await this.prisma.$transaction(async (tx) => {
        const reminder = await tx.reminder.create({
          data: {
            userId: principal.userId,
            title: dto.title,
            ...(dto.contextNote ? { contextNote: dto.contextNote } : {}),
          },
        });
        const storedSchedule = await tx.schedule.create({
          data: {
            reminderId: reminder.id,
            type: schedule.type,
            localStartDate: schedule.localDate,
            localStartTime: schedule.localTime,
            timezone: schedule.timezone,
            recurrenceWeekdays: schedule.weekdays,
            ...(schedule.endDate ? { endLocalDate: schedule.endDate } : {}),
            ...(schedule.occurrenceCount
              ? { occurrenceCount: schedule.occurrenceCount }
              : {}),
            resolvedStartAt: new Date(schedule.resolvedAt),
            resolvedUtcOffsetMin: schedule.utcOffsetMinutes,
            revision: 1,
            materializedThrough: new Date(lastOccurrence.scheduledAt),
            nextEvaluationAt: hasMoreOccurrences
              ? new Date(lastOccurrence.scheduledAt)
              : null,
          },
        });
        const firstOccurrence = occurrences[0]!;
        const occurrence = await tx.reminderOccurrence.create({
          data: {
            reminderId: reminder.id,
            scheduleId: storedSchedule.id,
            scheduleRevision: 1,
            sequence: firstOccurrence.sequence,
            occurrenceKey: this.occurrenceKey(firstOccurrence, schedule.timezone),
            originalScheduledAt: new Date(firstOccurrence.scheduledAt),
            effectiveScheduledAt: new Date(firstOccurrence.scheduledAt),
            localDate: firstOccurrence.localDate,
            localTime: firstOccurrence.localTime,
          },
        });
        if (occurrences.length > 1) {
          await tx.reminderOccurrence.createMany({
            data: occurrences.slice(1).map((item) => ({
              reminderId: reminder.id,
              scheduleId: storedSchedule.id,
              scheduleRevision: 1,
              sequence: item.sequence,
              occurrenceKey: this.occurrenceKey(item, schedule.timezone),
              originalScheduledAt: new Date(item.scheduledAt),
              effectiveScheduledAt: new Date(item.scheduledAt),
              localDate: item.localDate,
              localTime: item.localTime,
            })),
          });
        }
        await tx.reminderEvent.create({
          data: {
            userId: principal.userId,
            reminderId: reminder.id,
            occurrenceId: occurrence.id,
            actorType: 'USER',
            actorId: principal.userId,
            type: 'REMINDER_CREATED',
            idempotencyKey: key,
            metadata: {
              scheduleType: schedule.type,
              scheduleRevision: 1,
              firstOccurrenceAt: schedule.firstOccurrence.scheduledAt,
              materializedOccurrenceCount: occurrences.length,
            },
          },
        });
        await tx.reminderCreateRequest.create({
          data: {
            userId: principal.userId,
            reminderId: reminder.id,
            idempotencyKey: key,
            requestHash,
          },
        });
        return reminder.id;
      });

      const reminder = await this.loadOwnedReminder(principal.userId, reminderId);
      return this.toResponse(reminder, key, false);
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const raced = await this.findCreateRequest(principal.userId, key);
      if (!raced) throw error;
      return this.replay(raced.requestHash, requestHash, raced.reminder, key);
    }
  }

  private async findCreateRequest(userId: string, key: string) {
    return this.prisma.reminderCreateRequest.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
      include: { reminder: { include: reminderInclude } },
    });
  }

  private async loadOwnedReminder(userId: string, reminderId: string) {
    const reminder = await this.prisma.reminder.findFirst({
      where: { id: reminderId, userId },
      include: reminderInclude,
    });
    if (!reminder) throw new ConflictException('The created reminder could not be read.');
    return reminder;
  }

  private replay(
    storedHash: string,
    requestHash: string,
    reminder: ReminderRecord,
    key: string,
  ) {
    if (storedHash !== requestHash) {
      throw new ConflictException(
        'This idempotency key was already used with a different reminder request.',
      );
    }
    return this.toResponse(reminder, key, true);
  }

  private toResponse(
    reminder: {
      id: string;
      title: string;
      contextNote: string | null;
      lifecycle: string;
      revision: number;
      createdAt: Date;
      updatedAt: Date;
      schedules: Array<{
        id: string;
        type: string;
        localStartDate: string;
        localStartTime: string;
        timezone: string;
        recurrenceWeekdays: number[];
        endLocalDate: string | null;
        occurrenceCount: number | null;
        resolvedStartAt: Date;
        resolvedUtcOffsetMin: number;
        revision: number;
        materializedThrough: Date;
      }>;
      occurrences: Array<{
        id: string;
        scheduleId: string;
        scheduleRevision: number;
        lifecycle: string;
        localDate: string;
        localTime: string;
        originalScheduledAt: Date;
        effectiveScheduledAt: Date;
      }>;
    },
    key: string,
    replayed: boolean,
  ) {
    const schedule = reminder.schedules[0];
    const occurrence = reminder.occurrences[0];
    if (!schedule || !occurrence) {
      throw new ConflictException('The reminder schedule is incomplete.');
    }
    return {
      id: reminder.id,
      title: reminder.title,
      contextNote: reminder.contextNote,
      lifecycle: reminder.lifecycle,
      revision: reminder.revision,
      schedule: {
        id: schedule.id,
        type: schedule.type,
        localDate: schedule.localStartDate.trim(),
        localTime: schedule.localStartTime.trim(),
        timezone: schedule.timezone,
        weekdays: schedule.recurrenceWeekdays,
        endDate: schedule.endLocalDate?.trim() ?? null,
        occurrenceCount: schedule.occurrenceCount,
        resolvedAt: schedule.resolvedStartAt.toISOString(),
        utcOffsetMinutes: schedule.resolvedUtcOffsetMin,
        revision: schedule.revision,
        materializedThrough: schedule.materializedThrough.toISOString(),
      },
      firstOccurrence: {
        id: occurrence.id,
        scheduleId: occurrence.scheduleId,
        scheduleRevision: occurrence.scheduleRevision,
        lifecycle: occurrence.lifecycle,
        localDate: occurrence.localDate.trim(),
        localTime: occurrence.localTime.trim(),
        originalScheduledAt: occurrence.originalScheduledAt.toISOString(),
        effectiveScheduledAt: occurrence.effectiveScheduledAt.toISOString(),
      },
      idempotency: { key, replayed },
      createdAt: reminder.createdAt.toISOString(),
      updatedAt: reminder.updatedAt.toISOString(),
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

  private requestHash(dto: CreateReminderDto, weekdays: number[]): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          title: dto.title,
          contextNote: dto.contextNote ?? null,
          schedule: {
            type: dto.schedule.type,
            localDate: dto.schedule.localDate,
            localTime: dto.schedule.localTime,
            timezone: dto.schedule.timezone,
            weekdays,
            endDate: dto.schedule.endDate ?? null,
            occurrenceCount: dto.schedule.occurrenceCount ?? null,
          },
          confirmed: dto.confirmed,
          confirmedResolvedAt: new Date(dto.confirmedResolvedAt).toISOString(),
        }),
      )
      .digest('hex');
  }

  private occurrenceKey(
    occurrence: { sequence: number; localDate: string; localTime: string },
    timezone: string,
  ): string {
    return `${occurrence.localDate}T${occurrence.localTime}[${timezone}]#${occurrence.sequence}`;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private encodeCursor(at: Date, id: string): string {
    return Buffer.from(JSON.stringify({ at: at.toISOString(), id }), 'utf8').toString(
      'base64url',
    );
  }

  private decodeCursor(value: string): { at: Date; id: string } {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
        at?: unknown;
        id?: unknown;
      };
      if (
        typeof parsed.at !== 'string' ||
        Number.isNaN(new Date(parsed.at).getTime()) ||
        typeof parsed.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          parsed.id,
        )
      ) {
        throw new Error('invalid cursor');
      }
      return { at: new Date(parsed.at), id: parsed.id };
    } catch {
      throw new BadRequestException('cursor is invalid.');
    }
  }
}
