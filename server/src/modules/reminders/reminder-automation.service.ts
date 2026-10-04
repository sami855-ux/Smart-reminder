import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.schema.js';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  ContextTriggerTypeDto,
  WorkflowStepConditionDto,
  type CreateContextTriggerDto,
  type CreateWorkflowDto,
  type ReportTriggerEventDto,
} from './dto/reminder-automation.dto.js';
import { ReminderScheduleService } from './reminder-schedule.service.js';
import { ReminderScheduleTypeDto } from './dto/reminder-schedule.dto.js';

type TerminalOutcome = 'COMPLETED' | 'SKIPPED';

@Injectable()
export class ReminderAutomationService {
  private readonly contextKey: Buffer;
  private readonly fingerprintKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: ReminderScheduleService,
    config: ConfigService<Environment, true>,
  ) {
    this.contextKey = Buffer.from(config.get('CONTEXT_DATA_KEY_BASE64', { infer: true }), 'base64');
    this.fingerprintKey = createHmac('sha256', this.contextKey)
      .update('smart-reminder:wifi-fingerprint-key:v1')
      .digest();
  }

  async createWorkflow(
    principal: AuthPrincipal,
    sourceReminderId: string,
    idempotencyKey: string | undefined,
    dto: CreateWorkflowDto,
  ) {
    const key = this.validateKey(idempotencyKey);
    const requestHash = this.hash({ action: 'create-workflow', sourceReminderId, ...dto });
    const replay = await this.findEvent(principal.userId, key);
    if (replay) return this.replayWorkflow(replay, requestHash, key);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const source = await tx.reminder.findFirst({
          where: { id: sourceReminderId, userId: principal.userId },
          select: { id: true, lifecycle: true, revision: true },
        });
        if (!source) throw new NotFoundException('Source reminder not found.');
        if (source.lifecycle !== 'ACTIVE' || source.revision !== dto.expectedReminderRevision) {
          throw new ConflictException({
            code: 'REMINDER_STATE_CONFLICT',
            message: 'The source reminder changed. Refresh it before creating this workflow.',
            details: { reminderId: source.id, lifecycle: source.lifecycle, revision: source.revision },
          });
        }
        const workflow = await tx.reminderWorkflow.create({
          data: {
            userId: principal.userId,
            sourceReminderId,
            name: dto.name,
            steps: {
              create: dto.steps.map((step, index) => ({
                position: index + 1,
                title: step.title,
                contextNote: step.contextNote?.normalize('NFC').trim() || null,
                delayMinutes: step.delayMinutes ?? 0,
                condition: step.condition ?? WorkflowStepConditionDto.PREVIOUS_COMPLETED,
              })),
            },
          },
          include: { steps: { orderBy: { position: 'asc' } } },
        });
        await tx.reminder.update({
          where: { id: sourceReminderId },
          data: { revision: { increment: 1 } },
        });
        const event = await tx.reminderEvent.create({
          data: {
            userId: principal.userId,
            reminderId: sourceReminderId,
            actorType: 'USER',
            actorId: principal.userId,
            type: 'WORKFLOW_CREATED',
            idempotencyKey: key,
            requestHash,
            metadata: {
              workflowId: workflow.id,
              stepCount: workflow.steps.length,
              reminderRevision: dto.expectedReminderRevision + 1,
            },
          },
        });
        return { workflow, eventId: event.id };
      }, { isolationLevel: 'Serializable' });
      return {
        ...this.workflowResponse(result.workflow),
        sourceReminderRevision: dto.expectedReminderRevision + 1,
        eventId: result.eventId,
        idempotency: { key, replayed: false },
      };
    } catch (error) {
      if (!this.isUnique(error)) throw error;
      const raced = await this.findEvent(principal.userId, key);
      if (!raced) throw error;
      return this.replayWorkflow(raced, requestHash, key);
    }
  }

  async listWorkflows(userId: string, sourceReminderId: string) {
    const owned = await this.prisma.reminder.findFirst({
      where: { id: sourceReminderId, userId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Reminder not found.');
    const items = await this.prisma.reminderWorkflow.findMany({
      where: { sourceReminderId, userId },
      include: { steps: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return { items: items.map((item) => this.workflowResponse(item)) };
  }

  async createContextTrigger(
    principal: AuthPrincipal,
    reminderId: string,
    idempotencyKey: string | undefined,
    dto: CreateContextTriggerDto,
  ) {
    const key = this.validateKey(idempotencyKey);
    this.assertTriggerShape(dto);
    const requestHash = this.hash({ action: 'create-context-trigger', reminderId, ...dto });
    const replay = await this.findEvent(principal.userId, key);
    if (replay) return this.replayTrigger(replay, requestHash, key);
    const locationCiphertext =
      dto.type === ContextTriggerTypeDto.WIFI_CONNECT
        ? null
        : this.encryptLocation(dto.latitude!, dto.longitude!);
    const networkFingerprint =
      dto.type === ContextTriggerTypeDto.WIFI_CONNECT
        ? this.networkFingerprint(principal.userId, dto.networkName!)
        : null;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const reminder = await tx.reminder.findFirst({
          where: { id: reminderId, userId: principal.userId },
          select: { id: true, lifecycle: true, revision: true },
        });
        if (!reminder) throw new NotFoundException('Reminder not found.');
        if (reminder.lifecycle !== 'ACTIVE' || reminder.revision !== dto.expectedReminderRevision) {
          throw new ConflictException({
            code: 'REMINDER_STATE_CONFLICT',
            message: 'The reminder changed. Refresh it before adding a trigger.',
            details: { reminderId, lifecycle: reminder.lifecycle, revision: reminder.revision },
          });
        }
        const trigger = await tx.contextTrigger.create({
          data: {
            userId: principal.userId,
            reminderId,
            type: dto.type,
            label: dto.label,
            locationCiphertext,
            locationKeyVersion: locationCiphertext ? 1 : null,
            radiusMeters: dto.radiusMeters ?? null,
            networkFingerprint,
            cooldownSeconds: dto.cooldownSeconds ?? 300,
          },
        });
        await tx.reminder.update({ where: { id: reminderId }, data: { revision: { increment: 1 } } });
        const event = await tx.reminderEvent.create({
          data: {
            userId: principal.userId,
            reminderId,
            actorType: 'USER',
            actorId: principal.userId,
            type: 'CONTEXT_TRIGGER_CREATED',
            idempotencyKey: key,
            requestHash,
            metadata: {
              triggerId: trigger.id,
              triggerType: trigger.type,
              reminderRevision: dto.expectedReminderRevision + 1,
            },
          },
        });
        return { trigger, eventId: event.id };
      }, { isolationLevel: 'Serializable' });
      return {
        ...this.triggerResponse(result.trigger),
        reminderRevision: dto.expectedReminderRevision + 1,
        eventId: result.eventId,
        idempotency: { key, replayed: false },
      };
    } catch (error) {
      if (!this.isUnique(error)) throw error;
      const raced = await this.findEvent(principal.userId, key);
      if (!raced) throw error;
      return this.replayTrigger(raced, requestHash, key);
    }
  }

  async listContextTriggers(userId: string, reminderId?: string) {
    const items = await this.prisma.contextTrigger.findMany({
      where: { userId, ...(reminderId ? { reminderId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return { items: items.map((item) => this.triggerResponse(item)) };
  }

  async reportTriggerEvent(
    principal: AuthPrincipal,
    triggerId: string,
    dto: ReportTriggerEventDto,
    now = new Date(),
  ) {
    const occurredAt = new Date(dto.occurredAt);
    if (Math.abs(now.getTime() - occurredAt.getTime()) > 24 * 60 * 60_000) {
      throw new BadRequestException('occurredAt must be within 24 hours of server time.');
    }
    const requestHash = this.hash({ triggerId, ...dto });
    const previous = await this.prisma.triggerEvaluation.findUnique({
      where: { userId_eventKey: { userId: principal.userId, eventKey: dto.eventKey } },
      include: { createdOccurrence: { include: { reminder: true } } },
    });
    if (previous) return this.replayEvaluation(previous, requestHash);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const [trigger, installation] = await Promise.all([
          tx.contextTrigger.findFirst({
            where: { id: triggerId, userId: principal.userId },
            include: {
              reminder: {
                include: { checklistTemplates: { where: { archivedAt: null }, orderBy: { position: 'asc' } } },
              },
            },
          }),
          tx.deviceInstallation.findFirst({
            where: { id: dto.installationId, userId: principal.userId, revokedAt: null },
          }),
        ]);
        if (!trigger) throw new NotFoundException('Context trigger not found.');
        if (!installation) throw new ConflictException('The reporting device is not active.');
        if (trigger.lifecycle !== 'ACTIVE') {
          return this.recordSuppressed(tx, principal.userId, trigger, dto, requestHash, 'TRIGGER_NOT_ACTIVE');
        }
        if (trigger.reminder.lifecycle === 'CANCELLED') {
          return this.recordSuppressed(tx, principal.userId, trigger, dto, requestHash, 'REMINDER_CANCELLED');
        }
        if (
          trigger.type === 'WIFI_CONNECT' &&
          (!dto.networkName ||
            this.networkFingerprint(principal.userId, dto.networkName) !== trigger.networkFingerprint)
        ) {
          return this.recordSuppressed(tx, principal.userId, trigger, dto, requestHash, 'NETWORK_MISMATCH');
        }
        if (
          trigger.lastTriggeredAt &&
          now.getTime() - trigger.lastTriggeredAt.getTime() < trigger.cooldownSeconds * 1_000
        ) {
          return this.recordSuppressed(tx, principal.userId, trigger, dto, requestHash, 'COOLDOWN_ACTIVE');
        }

        const generated = await this.createGeneratedReminder(
          tx,
          principal.userId,
          trigger.reminder.title,
          trigger.reminder.contextNote,
          trigger.reminder.checklistTemplates,
          0,
          now,
          `trigger:${trigger.id}:${dto.eventKey}`,
        );
        const evaluation = await tx.triggerEvaluation.create({
          data: {
            userId: principal.userId,
            triggerId: trigger.id,
            installationId: dto.installationId,
            eventKey: dto.eventKey,
            requestHash,
            occurredAt,
            outcome: 'FIRED',
            createdOccurrenceId: generated.occurrence.id,
          },
        });
        await tx.contextTrigger.update({
          where: { id: trigger.id },
          data: { lastTriggeredAt: now },
        });
        await tx.reminderEvent.create({
          data: {
            userId: principal.userId,
            reminderId: generated.reminder.id,
            occurrenceId: generated.occurrence.id,
            actorType: 'DEVICE',
            actorId: dto.installationId,
            type: 'CONTEXT_TRIGGER_FIRED',
            idempotencyKey: `trigger-${this.hash(`${trigger.id}:${dto.eventKey}`).slice(0, 48)}`,
            requestHash,
            metadata: { triggerId: trigger.id, triggerType: trigger.type, evaluationId: evaluation.id },
          },
        });
        return {
          evaluationId: evaluation.id,
          triggerId: trigger.id,
          outcome: 'FIRED' as const,
          reason: null,
          reminder: this.generatedReminderResponse(generated),
          replayed: false,
        };
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (!this.isUnique(error)) throw error;
      const raced = await this.prisma.triggerEvaluation.findUnique({
        where: { userId_eventKey: { userId: principal.userId, eventKey: dto.eventKey } },
        include: { createdOccurrence: { include: { reminder: true, schedule: true } } },
      });
      if (!raced) throw error;
      return this.replayEvaluation(raced, requestHash);
    }
  }

  async advanceWithinTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    occurrence: { id: string; reminderId: string },
    outcome: TerminalOutcome,
    now: Date,
  ) {
    if (outcome !== 'COMPLETED') return [];
    const generated: Array<{ reminderId: string; occurrenceId: string }> = [];
    const parent = await tx.workflowStepRun.findUnique({
      where: { generatedOccurrenceId: occurrence.id },
      include: {
        step: true,
        run: { include: { workflow: { include: { steps: { orderBy: { position: 'asc' } } } } } },
      },
    });
    if (parent) {
      await tx.workflowStepRun.update({
        where: { id: parent.id },
        data: { lifecycle: 'COMPLETED', completedAt: now },
      });
      const next = parent.run.workflow.steps.find((step) => step.position === parent.step.position + 1);
      if (!next) {
        await tx.workflowRun.update({
          where: { id: parent.runId },
          data: { lifecycle: 'COMPLETED', completedAt: now },
        });
      } else if (await this.conditionMatches(tx, next.condition, occurrence.id)) {
        generated.push(await this.activateWorkflowStep(tx, userId, parent.runId, next, now));
      } else {
        await tx.workflowRun.update({
          where: { id: parent.runId },
          data: { lifecycle: 'STOPPED', completedAt: now },
        });
      }
    }

    const workflows = await tx.reminderWorkflow.findMany({
      where: { sourceReminderId: occurrence.reminderId, userId, lifecycle: 'ACTIVE' },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
    for (const workflow of workflows) {
      const first = workflow.steps[0];
      if (!first) continue;
      const existing = await tx.workflowRun.findUnique({
        where: { workflowId_sourceOccurrenceId: { workflowId: workflow.id, sourceOccurrenceId: occurrence.id } },
      });
      if (existing) continue;
      const run = await tx.workflowRun.create({
        data: { workflowId: workflow.id, sourceOccurrenceId: occurrence.id },
      });
      if (await this.conditionMatches(tx, first.condition, occurrence.id)) {
        generated.push(await this.activateWorkflowStep(tx, userId, run.id, first, now));
      } else {
        await tx.workflowRun.update({
          where: { id: run.id },
          data: { lifecycle: 'STOPPED', completedAt: now },
        });
      }
    }
    return generated;
  }

  private async activateWorkflowStep(
    tx: Prisma.TransactionClient,
    userId: string,
    runId: string,
    step: { id: string; position: number; title: string; contextNote: string | null; delayMinutes: number },
    now: Date,
  ) {
    const generated = await this.createGeneratedReminder(
      tx,
      userId,
      step.title,
      step.contextNote,
      [],
      step.delayMinutes,
      now,
      `workflow:${runId}:${step.id}`,
    );
    await tx.workflowStepRun.create({
      data: {
        runId,
        stepId: step.id,
        generatedReminderId: generated.reminder.id,
        generatedOccurrenceId: generated.occurrence.id,
      },
    });
    await tx.workflowRun.update({
      where: { id: runId },
      data: { currentPosition: step.position },
    });
    await tx.reminderEvent.create({
      data: {
        userId,
        reminderId: generated.reminder.id,
        occurrenceId: generated.occurrence.id,
        actorType: 'SYSTEM',
        type: 'WORKFLOW_STEP_ACTIVATED',
        idempotencyKey: `workflow-${this.hash(`${runId}:${step.id}`).slice(0, 48)}`,
        metadata: { runId, stepId: step.id, position: step.position },
      },
    });
    return { reminderId: generated.reminder.id, occurrenceId: generated.occurrence.id };
  }

  private async conditionMatches(
    tx: Prisma.TransactionClient,
    condition: 'PREVIOUS_COMPLETED' | 'ALL_CHECKLIST_COMPLETED',
    occurrenceId: string,
  ) {
    if (condition === 'PREVIOUS_COMPLETED') return true;
    const [total, unchecked] = await Promise.all([
      tx.occurrenceChecklistItem.count({ where: { occurrenceId } }),
      tx.occurrenceChecklistItem.count({ where: { occurrenceId, checkedAt: null } }),
    ]);
    return total > 0 && unchecked === 0;
  }

  private async createGeneratedReminder(
    tx: Prisma.TransactionClient,
    userId: string,
    title: string,
    contextNote: string | null,
    templates: Array<{ id: string; text: string; position: number }>,
    delayMinutes: number,
    now: Date,
    originKey: string,
  ) {
    const user = await tx.user.findFirst({
      where: { id: userId, status: 'ACTIVE', deletedAt: null },
      select: { timezone: true },
    });
    if (!user) throw new ConflictException('The account is no longer active.');
    const dueAt = new Date(now.getTime() + Math.max(delayMinutes, 1) * 60_000);
    const parts = this.schedules.localPartsAtInstant(dueAt, user.timezone);
    const resolved = this.schedules.resolve(
      {
        type: ReminderScheduleTypeDto.ONE_TIME,
        localDate: parts.date,
        localTime: parts.time,
        timezone: user.timezone,
      },
      new Date(now.getTime() - 60_000),
    );
    const reminder = await tx.reminder.create({ data: { userId, title, contextNote } });
    const schedule = await tx.schedule.create({
      data: {
        reminderId: reminder.id,
        type: 'ONE_TIME',
        localStartDate: resolved.localDate,
        localStartTime: resolved.localTime,
        timezone: resolved.timezone,
        resolvedStartAt: new Date(resolved.resolvedAt),
        resolvedUtcOffsetMin: resolved.utcOffsetMinutes,
        materializedThrough: new Date(resolved.resolvedAt),
      },
    });
    const occurrence = await tx.reminderOccurrence.create({
      data: {
        reminderId: reminder.id,
        scheduleId: schedule.id,
        scheduleRevision: 1,
        sequence: 1,
        occurrenceKey: `${originKey.slice(0, 112)}#1`,
        originalScheduledAt: new Date(resolved.resolvedAt),
        effectiveScheduledAt: new Date(resolved.resolvedAt),
        localDate: resolved.firstOccurrence.localDate,
        localTime: resolved.firstOccurrence.localTime,
      },
    });
    if (templates.length) {
      const createdTemplates = [] as Array<{ id: string; text: string; position: number }>;
      for (const template of templates) {
        const created = await tx.reminderChecklistItem.create({
          data: { reminderId: reminder.id, text: template.text, position: template.position },
        });
        createdTemplates.push(created);
      }
      await tx.occurrenceChecklistItem.createMany({
        data: createdTemplates.map((item) => ({
          occurrenceId: occurrence.id,
          sourceItemId: item.id,
          text: item.text,
          position: item.position,
        })),
      });
    }
    return { reminder, schedule, occurrence };
  }

  private recordSuppressed(
    tx: Prisma.TransactionClient,
    userId: string,
    trigger: { id: string },
    dto: ReportTriggerEventDto,
    requestHash: string,
    reason: string,
  ) {
    return tx.triggerEvaluation.create({
      data: {
        userId,
        triggerId: trigger.id,
        installationId: dto.installationId,
        eventKey: dto.eventKey,
        requestHash,
        occurredAt: new Date(dto.occurredAt),
        outcome: 'SUPPRESSED',
        reason,
      },
    }).then((evaluation) => ({
      evaluationId: evaluation.id,
      triggerId: trigger.id,
      outcome: 'SUPPRESSED' as const,
      reason,
      reminder: null,
      replayed: false,
    }));
  }

  private replayEvaluation(
    evaluation: {
      id: string;
      triggerId: string;
      requestHash: string;
      outcome: 'FIRED' | 'SUPPRESSED' | 'REJECTED';
      reason: string | null;
      createdOccurrence?: ({ reminder: { id: string; title: string; contextNote: string | null }; schedule?: { timezone: string } | null } & Record<string, unknown>) | null;
    },
    requestHash: string,
  ) {
    if (evaluation.requestHash !== requestHash) {
      throw new ConflictException('This trigger event key was already used with different evidence.');
    }
    return {
      evaluationId: evaluation.id,
      triggerId: evaluation.triggerId,
      outcome: evaluation.outcome,
      reason: evaluation.reason,
      reminder: null,
      replayed: true,
    };
  }

  private workflowResponse(workflow: {
    id: string;
    sourceReminderId: string;
    name: string;
    lifecycle: string;
    revision: number;
    steps: Array<{ id: string; position: number; title: string; contextNote: string | null; delayMinutes: number; condition: string }>;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: workflow.id,
      sourceReminderId: workflow.sourceReminderId,
      name: workflow.name,
      lifecycle: workflow.lifecycle,
      revision: workflow.revision,
      steps: workflow.steps,
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
    };
  }

  private triggerResponse(trigger: {
    id: string;
    reminderId: string;
    type: string;
    lifecycle: string;
    label: string;
    locationCiphertext: string | null;
    radiusMeters: number | null;
    cooldownSeconds: number;
    revision: number;
    lastTriggeredAt: Date | null;
    unavailableReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const location = trigger.locationCiphertext ? this.decryptLocation(trigger.locationCiphertext) : null;
    return {
      id: trigger.id,
      reminderId: trigger.reminderId,
      type: trigger.type,
      lifecycle: trigger.lifecycle,
      label: trigger.label,
      location: location ? { ...location, radiusMeters: trigger.radiusMeters } : null,
      network: trigger.type === 'WIFI_CONNECT' ? { configured: true } : null,
      cooldownSeconds: trigger.cooldownSeconds,
      revision: trigger.revision,
      lastTriggeredAt: trigger.lastTriggeredAt?.toISOString() ?? null,
      unavailableReason: trigger.unavailableReason,
      createdAt: trigger.createdAt.toISOString(),
      updatedAt: trigger.updatedAt.toISOString(),
    };
  }

  private generatedReminderResponse(generated: {
    reminder: { id: string; title: string; contextNote: string | null };
    schedule: { id: string; timezone: string; revision: number };
    occurrence: {
      id: string;
      scheduleRevision: number;
      lifecycle: string;
      localDate: string;
      localTime: string;
      originalScheduledAt: Date;
      effectiveScheduledAt: Date;
    };
  }) {
    return {
      id: generated.reminder.id,
      title: generated.reminder.title,
      contextNote: generated.reminder.contextNote,
      scheduleId: generated.schedule.id,
      timezone: generated.schedule.timezone,
      occurrence: {
        id: generated.occurrence.id,
        scheduleRevision: generated.occurrence.scheduleRevision,
        lifecycle: generated.occurrence.lifecycle,
        localDate: generated.occurrence.localDate.trim(),
        localTime: generated.occurrence.localTime.trim(),
        originalScheduledAt: generated.occurrence.originalScheduledAt.toISOString(),
        effectiveScheduledAt: generated.occurrence.effectiveScheduledAt.toISOString(),
      },
    };
  }

  private assertTriggerShape(dto: CreateContextTriggerDto) {
    if (dto.type === ContextTriggerTypeDto.WIFI_CONNECT) {
      if (!dto.networkName) throw new BadRequestException('networkName is required for a Wi-Fi trigger.');
      if (dto.latitude !== undefined || dto.longitude !== undefined || dto.radiusMeters !== undefined) {
        throw new BadRequestException('Wi-Fi triggers cannot include location coordinates.');
      }
      return;
    }
    if (dto.latitude === undefined || dto.longitude === undefined || dto.radiusMeters === undefined) {
      throw new BadRequestException('latitude, longitude, and radiusMeters are required for a location trigger.');
    }
    if (dto.networkName !== undefined) {
      throw new BadRequestException('Location triggers cannot include a network name.');
    }
  }

  private encryptLocation(latitude: number, longitude: number) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.contextKey, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify({ latitude, longitude }), 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((value) => value.toString('base64url')).join('.');
  }

  private decryptLocation(value: string): { latitude: number; longitude: number } {
    try {
      const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part!, 'base64url'));
      const decipher = createDecipheriv('aes-256-gcm', this.contextKey, iv!);
      decipher.setAuthTag(tag!);
      return JSON.parse(Buffer.concat([decipher.update(encrypted!), decipher.final()]).toString('utf8')) as {
        latitude: number;
        longitude: number;
      };
    } catch {
      throw new ConflictException('Saved location data could not be decrypted.');
    }
  }

  private networkFingerprint(userId: string, networkName: string) {
    return createHmac('sha256', this.fingerprintKey)
      .update(`${userId}:${networkName.normalize('NFC').trim().toLocaleLowerCase('en-US')}`)
      .digest('hex');
  }

  private findEvent(userId: string, key: string) {
    return this.prisma.reminderEvent.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
    });
  }

  private async replayWorkflow(
    event: { id: string; reminderId: string; requestHash: string | null; metadata: unknown },
    requestHash: string,
    key: string,
  ) {
    if (event.requestHash !== requestHash) {
      throw new ConflictException('This idempotency key was already used with a different request.');
    }
    const workflowId = this.metadataId(event.metadata, 'workflowId');
    const workflow = await this.prisma.reminderWorkflow.findUnique({
      where: { id: workflowId },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
    if (!workflow) throw new NotFoundException('Workflow not found.');
    const reminder = await this.prisma.reminder.findUnique({
      where: { id: event.reminderId },
      select: { revision: true },
    });
    return {
      ...this.workflowResponse(workflow),
      sourceReminderRevision: reminder?.revision ?? 1,
      eventId: event.id,
      idempotency: { key, replayed: true },
    };
  }

  private async replayTrigger(
    event: { id: string; reminderId: string; requestHash: string | null; metadata: unknown },
    requestHash: string,
    key: string,
  ) {
    if (event.requestHash !== requestHash) {
      throw new ConflictException('This idempotency key was already used with a different request.');
    }
    const triggerId = this.metadataId(event.metadata, 'triggerId');
    const [trigger, reminder] = await Promise.all([
      this.prisma.contextTrigger.findUnique({ where: { id: triggerId } }),
      this.prisma.reminder.findUnique({ where: { id: event.reminderId }, select: { revision: true } }),
    ]);
    if (!trigger) throw new NotFoundException('Context trigger not found.');
    return {
      ...this.triggerResponse(trigger),
      reminderRevision: reminder?.revision ?? 1,
      eventId: event.id,
      idempotency: { key, replayed: true },
    };
  }

  private metadataId(metadata: unknown, field: string) {
    if (
      typeof metadata !== 'object' ||
      metadata === null ||
      !(field in metadata) ||
      typeof (metadata as Record<string, unknown>)[field] !== 'string'
    ) {
      throw new ConflictException('The idempotent operation metadata is incomplete.');
    }
    return (metadata as Record<string, string>)[field]!;
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
