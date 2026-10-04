import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { ReplaceChecklistDto, ToggleChecklistItemDto } from './dto/reminder-automation.dto.js';

@Injectable()
export class ReminderChecklistService {
  constructor(private readonly prisma: PrismaService) {}

  async replace(
    principal: AuthPrincipal,
    reminderId: string,
    idempotencyKey: string | undefined,
    dto: ReplaceChecklistDto,
    now = new Date(),
  ) {
    const key = this.validateKey(idempotencyKey);
    const requestHash = this.hash({ action: 'replace-checklist', reminderId, ...dto });
    const replay = await this.prisma.reminderEvent.findUnique({
      where: { userId_idempotencyKey: { userId: principal.userId, idempotencyKey: key } },
    });
    if (replay) return this.replayReplace(replay, requestHash, key);
    const requestedIds = dto.items.flatMap((item) => (item.id ? [item.id] : []));
    if (new Set(requestedIds).size !== requestedIds.length) {
      throw new BadRequestException('Checklist item IDs must be unique.');
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const reminder = await tx.reminder.findFirst({
          where: { id: reminderId, userId: principal.userId },
          include: { checklistTemplates: { where: { archivedAt: null } } },
        });
        if (!reminder) throw new NotFoundException('Reminder not found.');
        if (reminder.lifecycle !== 'ACTIVE' || reminder.revision !== dto.expectedReminderRevision) {
          throw new ConflictException({
            code: 'REMINDER_STATE_CONFLICT',
            message: 'The reminder changed. Refresh it before editing its checklist.',
            details: { reminderId, lifecycle: reminder.lifecycle, revision: reminder.revision },
          });
        }
        const existingIds = new Set(reminder.checklistTemplates.map((item) => item.id));
        if (requestedIds.some((id) => !existingIds.has(id))) {
          throw new BadRequestException('A checklist item does not belong to this reminder.');
        }

        await tx.reminderChecklistItem.updateMany({
          where: { reminderId, archivedAt: null },
          data: { archivedAt: now },
        });
        const active = [] as Array<{ id: string; text: string; position: number }>;
        for (const [position, item] of dto.items.entries()) {
          if (item.id) {
            const updated = await tx.reminderChecklistItem.update({
              where: { id: item.id },
              data: { text: item.text, position, archivedAt: null, revision: { increment: 1 } },
            });
            active.push({ id: updated.id, text: updated.text, position: updated.position });
          } else {
            const created = await tx.reminderChecklistItem.create({
              data: { reminderId, text: item.text, position },
            });
            active.push({ id: created.id, text: created.text, position: created.position });
          }
        }

        const scheduled = await tx.reminderOccurrence.findMany({
          where: { reminderId, lifecycle: 'SCHEDULED' },
          select: { id: true },
        });
        const activeIds = active.map((item) => item.id);
        if (scheduled.length > 0) {
          await tx.occurrenceChecklistItem.deleteMany({
            where: {
              occurrenceId: { in: scheduled.map((item) => item.id) },
              ...(activeIds.length ? { sourceItemId: { notIn: activeIds } } : {}),
            },
          });
          for (const occurrence of scheduled) {
            for (const item of active) {
              await tx.occurrenceChecklistItem.upsert({
                where: {
                  occurrenceId_sourceItemId: {
                    occurrenceId: occurrence.id,
                    sourceItemId: item.id,
                  },
                },
                create: {
                  occurrenceId: occurrence.id,
                  sourceItemId: item.id,
                  text: item.text,
                  position: item.position,
                },
                update: { text: item.text, position: item.position, revision: { increment: 1 } },
              });
            }
          }
        }

        await tx.reminder.update({
          where: { id: reminderId },
          data: { revision: { increment: 1 } },
        });
        const event = await tx.reminderEvent.create({
          data: {
            userId: principal.userId,
            reminderId,
            actorType: 'USER',
            actorId: principal.userId,
            type: 'CHECKLIST_UPDATED',
            idempotencyKey: key,
            requestHash,
            metadata: { itemCount: active.length, reminderRevision: dto.expectedReminderRevision + 1 },
          },
        });
        return { eventId: event.id, items: active };
      }, { isolationLevel: 'Serializable' });
      return {
        reminderId,
        reminderRevision: dto.expectedReminderRevision + 1,
        items: result.items.map((item) => ({ ...item, archivedAt: null })),
        eventId: result.eventId,
        idempotency: { key, replayed: false },
      };
    } catch (error) {
      if (!this.isUnique(error)) throw error;
      const raced = await this.prisma.reminderEvent.findUnique({
        where: { userId_idempotencyKey: { userId: principal.userId, idempotencyKey: key } },
      });
      if (!raced) throw error;
      return this.replayReplace(raced, requestHash, key);
    }
  }

  async toggle(
    principal: AuthPrincipal,
    occurrenceId: string,
    itemId: string,
    idempotencyKey: string | undefined,
    dto: ToggleChecklistItemDto,
    now = new Date(),
  ) {
    const key = this.validateKey(idempotencyKey);
    const requestHash = this.hash({ action: 'toggle-checklist-item', occurrenceId, itemId, ...dto });
    const replay = await this.prisma.reminderEvent.findUnique({
      where: { userId_idempotencyKey: { userId: principal.userId, idempotencyKey: key } },
    });
    if (replay) return this.replayToggle(replay, requestHash, occurrenceId, itemId, key);

    try {
      return await this.prisma.$transaction(async (tx) => {
      const item = await tx.occurrenceChecklistItem.findFirst({
        where: { id: itemId, occurrenceId, occurrence: { reminder: { userId: principal.userId } } },
        include: { occurrence: { select: { reminderId: true, lifecycle: true } } },
      });
      if (!item) throw new NotFoundException('Checklist item not found.');
      if (item.occurrence.lifecycle !== 'SCHEDULED') {
        throw new ConflictException('Checklist items on completed, cancelled, or skipped occurrences are read-only.');
      }
      if (item.revision !== dto.expectedRevision) {
        throw new ConflictException({
          code: 'CHECKLIST_ITEM_STATE_CONFLICT',
          message: 'The checklist item changed. Refresh it before trying again.',
          details: { itemId, revision: item.revision, checked: item.checkedAt !== null },
        });
      }
      const changed = await tx.occurrenceChecklistItem.updateMany({
        where: { id: itemId, occurrenceId, revision: dto.expectedRevision },
        data: { checkedAt: dto.checked ? now : null, revision: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('The checklist item changed. Refresh it.');
      const event = await tx.reminderEvent.create({
        data: {
          userId: principal.userId,
          reminderId: item.occurrence.reminderId,
          occurrenceId,
          actorType: 'USER',
          actorId: principal.userId,
          type: dto.checked ? 'CHECKLIST_ITEM_CHECKED' : 'CHECKLIST_ITEM_UNCHECKED',
          idempotencyKey: key,
          requestHash,
          metadata: { checklistItemId: itemId, checked: dto.checked, itemRevision: dto.expectedRevision + 1 },
        },
      });
      return {
        occurrenceId,
        item: {
          id: itemId,
          sourceItemId: item.sourceItemId,
          text: item.text,
          position: item.position,
          checked: dto.checked,
          checkedAt: dto.checked ? now.toISOString() : null,
          revision: dto.expectedRevision + 1,
        },
        eventId: event.id,
        idempotency: { key, replayed: false },
      };
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (!this.isUnique(error)) throw error;
      const raced = await this.prisma.reminderEvent.findUnique({
        where: { userId_idempotencyKey: { userId: principal.userId, idempotencyKey: key } },
      });
      if (!raced) throw error;
      return this.replayToggle(raced, requestHash, occurrenceId, itemId, key);
    }
  }

  async snapshotScheduledOccurrences(tx: Prisma.TransactionClient, reminderId: string) {
    const [templates, occurrences] = await Promise.all([
      tx.reminderChecklistItem.findMany({
        where: { reminderId, archivedAt: null },
        orderBy: { position: 'asc' },
      }),
      tx.reminderOccurrence.findMany({
        where: { reminderId, lifecycle: 'SCHEDULED' },
        select: { id: true, checklistItems: { select: { sourceItemId: true } } },
      }),
    ]);
    const rows = occurrences.flatMap((occurrence) => {
      const existing = new Set(occurrence.checklistItems.map((item) => item.sourceItemId));
      return templates
        .filter((template) => !existing.has(template.id))
        .map((template) => ({
          occurrenceId: occurrence.id,
          sourceItemId: template.id,
          text: template.text,
          position: template.position,
        }));
    });
    if (rows.length) await tx.occurrenceChecklistItem.createMany({ data: rows, skipDuplicates: true });
  }

  private async replayReplace(
    event: { id: string; reminderId: string; requestHash: string | null; metadata: unknown },
    requestHash: string,
    key: string,
  ) {
    if (event.requestHash !== requestHash) {
      throw new ConflictException('This idempotency key was already used with a different request.');
    }
    const reminder = await this.prisma.reminder.findUnique({
      where: { id: event.reminderId },
      include: { checklistTemplates: { where: { archivedAt: null }, orderBy: { position: 'asc' } } },
    });
    if (!reminder) throw new NotFoundException('Reminder not found.');
    return {
      reminderId: event.reminderId,
      reminderRevision: reminder.revision,
      items: reminder.checklistTemplates.map((item) => ({
        id: item.id,
        text: item.text,
        position: item.position,
        revision: item.revision,
        archivedAt: null,
      })),
      eventId: event.id,
      idempotency: { key, replayed: true },
    };
  }

  private async replayToggle(
    event: { id: string; reminderId: string; requestHash: string | null },
    requestHash: string,
    occurrenceId: string,
    itemId: string,
    key: string,
  ) {
    if (event.requestHash !== requestHash) {
      throw new ConflictException('This idempotency key was already used with a different request.');
    }
    const item = await this.prisma.occurrenceChecklistItem.findFirst({
      where: { id: itemId, occurrenceId },
    });
    if (!item) throw new NotFoundException('Checklist item not found.');
    return {
      occurrenceId,
      item: {
        id: item.id,
        sourceItemId: item.sourceItemId,
        text: item.text,
        position: item.position,
        checked: item.checkedAt !== null,
        checkedAt: item.checkedAt?.toISOString() ?? null,
        revision: item.revision,
      },
      eventId: event.id,
      idempotency: { key, replayed: true },
    };
  }

  private validateKey(value: string | undefined) {
    const key = value?.trim();
    if (!key || key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/u.test(key)) {
      throw new BadRequestException('A valid Idempotency-Key header is required.');
    }
    return key;
  }

  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private isUnique(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002';
  }
}
