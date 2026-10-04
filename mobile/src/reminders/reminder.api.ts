import { z } from 'zod';

import { requestWithAccessToken } from '../api/client';
import { toApiError } from '../api/errors';
import {
  createdReminderSchema,
  nudgePolicySchema,
  occurrenceActionResultSchema,
  occurrenceExplanationSchema,
  occurrencePageSchema,
  parseReminderResponseSchema,
  reminderDetailSchema,
  reminderEventPageSchema,
  reminderMutationResultSchema,
  reminderPreviewSchema,
  timezonePreviewSchema,
  contextTriggerSchema,
  occurrenceChecklistItemSchema,
  reminderChecklistTemplateSchema,
  workflowSchema,
  type CreatedReminder,
  type NudgePolicy,
  type OccurrenceActionResult,
  type OccurrenceExplanation,
  type ParseReminderResponse,
  type ReminderDetail,
  type ReminderPreview,
  type ReminderScheduleInput,
  type TimezonePreview,
  type ContextTrigger,
  type ReminderWorkflow,
} from './reminder.schemas';

export type ReminderContentInput = {
  title: string;
  contextNote?: string;
  checklist?: { text: string }[];
  workflow?: {
    name: string;
    steps: {
      title: string;
      contextNote?: string;
      delayMinutes?: number;
      condition?: 'PREVIOUS_COMPLETED' | 'ALL_CHECKLIST_COMPLETED';
    }[];
  };
  contextTriggers?: {
    type: 'LOCATION_ARRIVE' | 'LOCATION_LEAVE' | 'WIFI_CONNECT';
    label: string;
    latitude?: number;
    longitude?: number;
    radiusMeters?: number;
    networkName?: string;
    cooldownSeconds?: number;
  }[];
  schedule: ReminderScheduleInput;
};

export async function previewReminder(
  input: ReminderContentInput,
): Promise<ReminderPreview> {
  const { workflow: _workflow, contextTriggers: _contextTriggers, ...previewInput } = input;
  try {
    return await requestWithAccessToken(
      { method: 'POST', url: '/reminders/preview', data: previewInput },
      reminderPreviewSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function createReminder(
  input: ReminderContentInput & { confirmedResolvedAt: string },
  idempotencyKey: string,
): Promise<CreatedReminder> {
  try {
    return await requestWithAccessToken(
      {
        method: 'POST',
        url: '/reminders',
        headers: {
          'Idempotency-Key': idempotencyKey,
          Prefer: 'return=representation',
        },
        data: { ...input, confirmed: true },
      },
      createdReminderSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function parseReminder(input: {
  text: string;
  referenceInstant: string;
  locale: string;
  timezone: string;
  timeFormat: '12-hour' | '24-hour';
}): Promise<ParseReminderResponse> {
  try {
    return await requestWithAccessToken(
      { method: 'POST', url: '/parse-reminder', data: input },
      parseReminderResponseSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function listReminderOccurrences(input: {
  view?: 'UPCOMING' | 'OVERDUE' | 'COMPLETED' | 'ALL';
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}) {
  try {
    return await requestWithAccessToken(
      { method: 'GET', url: '/reminder-occurrences', params: input },
      occurrencePageSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function completeOccurrence(input: {
  occurrenceId: string;
  expectedScheduleRevision: number;
  expectedEffectiveScheduledAt: string;
  idempotencyKey: string;
}): Promise<OccurrenceActionResult> {
  const { occurrenceId, idempotencyKey, ...data } = input;
  try {
    return await requestWithAccessToken(
      {
        method: 'POST',
        url: `/reminder-occurrences/${occurrenceId}/complete`,
        headers: { 'Idempotency-Key': idempotencyKey },
        data,
      },
      occurrenceActionResultSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function skipOccurrence(input: {
  occurrenceId: string;
  expectedScheduleRevision: number;
  expectedEffectiveScheduledAt: string;
  idempotencyKey: string;
}): Promise<OccurrenceActionResult> {
  const { occurrenceId, idempotencyKey, ...data } = input;
  try {
    return await requestWithAccessToken(
      {
        method: 'POST',
        url: `/reminder-occurrences/${occurrenceId}/skip`,
        headers: { 'Idempotency-Key': idempotencyKey },
        data,
      },
      occurrenceActionResultSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function updateReminderContent(input: {
  reminderId: string;
  expectedRevision: number;
  title?: string;
  contextNote?: string | null;
  idempotencyKey: string;
}) {
  const { reminderId, idempotencyKey, ...data } = input;
  try {
    return await requestWithAccessToken(
      {
        method: 'PATCH',
        url: `/reminders/${reminderId}`,
        headers: { 'Idempotency-Key': idempotencyKey },
        data,
      },
      reminderMutationResultSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function deleteReminder(input: {
  reminderId: string;
  expectedRevision: number;
  idempotencyKey: string;
}) {
  const { reminderId, idempotencyKey, ...data } = input;
  try {
    return await requestWithAccessToken(
      {
        method: 'DELETE',
        url: `/reminders/${reminderId}`,
        headers: { 'Idempotency-Key': idempotencyKey },
        data,
      },
      reminderMutationResultSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getNudgePolicy(reminderId: string): Promise<NudgePolicy> {
  try {
    return await requestWithAccessToken(
      { method: 'GET', url: `/reminders/${reminderId}/nudge-policy` },
      nudgePolicySchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

const nudgeMutationSchema = z
  .object({
    reminderId: z.uuid(),
    eventId: z.uuid(),
    idempotency: z.object({ key: z.string(), replayed: z.boolean() }).strict(),
  })
  .passthrough();

export async function updateNudgePolicy(input: {
  reminderId: string;
  expectedReminderRevision: number;
  enabled: boolean;
  intervalMinutes?: number;
  idempotencyKey: string;
}) {
  const { reminderId, idempotencyKey, ...data } = input;
  try {
    return await requestWithAccessToken(
      {
        method: 'PATCH',
        url: `/reminders/${reminderId}/nudge-policy`,
        headers: { 'Idempotency-Key': idempotencyKey },
        data,
      },
      nudgeMutationSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function listReminderEvents(reminderId: string, limit = 30) {
  try {
    return await requestWithAccessToken(
      { method: 'GET', url: `/reminders/${reminderId}/events`, params: { limit } },
      reminderEventPageSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getOccurrenceExplanation(
  occurrenceId: string,
): Promise<OccurrenceExplanation> {
  try {
    return await requestWithAccessToken(
      { method: 'GET', url: `/reminder-occurrences/${occurrenceId}/explanation` },
      occurrenceExplanationSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getReminder(reminderId: string): Promise<ReminderDetail> {
  try {
    return await requestWithAccessToken(
      { method: 'GET', url: `/reminders/${reminderId}` },
      reminderDetailSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

const checklistMutationSchema = z
  .object({
    reminderId: z.uuid(),
    reminderRevision: z.number().int().positive(),
    items: z.array(reminderChecklistTemplateSchema),
    eventId: z.uuid(),
    idempotency: z.object({ key: z.string(), replayed: z.boolean() }).strict(),
  })
  .strict();

export async function replaceReminderChecklist(input: {
  reminderId: string;
  expectedReminderRevision: number;
  items: { id?: string; text: string }[];
  idempotencyKey: string;
}) {
  const { reminderId, idempotencyKey, ...data } = input;
  try {
    return await requestWithAccessToken(
      {
        method: 'PATCH',
        url: `/reminders/${reminderId}/checklist`,
        headers: { 'Idempotency-Key': idempotencyKey },
        data,
      },
      checklistMutationSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

const checklistToggleSchema = z
  .object({
    occurrenceId: z.uuid(),
    item: occurrenceChecklistItemSchema,
    eventId: z.uuid(),
    idempotency: z.object({ key: z.string(), replayed: z.boolean() }).strict(),
  })
  .strict();

export async function toggleOccurrenceChecklistItem(input: {
  occurrenceId: string;
  itemId: string;
  expectedRevision: number;
  checked: boolean;
  idempotencyKey: string;
}) {
  const { occurrenceId, itemId, idempotencyKey, ...data } = input;
  try {
    return await requestWithAccessToken(
      {
        method: 'PATCH',
        url: `/reminder-occurrences/${occurrenceId}/checklist-items/${itemId}`,
        headers: { 'Idempotency-Key': idempotencyKey },
        data,
      },
      checklistToggleSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

const workflowMutationSchema = workflowSchema.extend({
  sourceReminderRevision: z.number().int().positive(),
  eventId: z.uuid(),
  idempotency: z.object({ key: z.string(), replayed: z.boolean() }).strict(),
});
const workflowPageSchema = z.object({ items: z.array(workflowSchema) }).strict();

export async function createReminderWorkflow(input: {
  reminderId: string;
  expectedReminderRevision: number;
  name: string;
  steps: {
    title: string;
    contextNote?: string;
    delayMinutes?: number;
    condition?: 'PREVIOUS_COMPLETED' | 'ALL_CHECKLIST_COMPLETED';
  }[];
  idempotencyKey: string;
}): Promise<ReminderWorkflow> {
  const { reminderId, idempotencyKey, ...data } = input;
  try {
    return await requestWithAccessToken(
      {
        method: 'POST',
        url: `/reminders/${reminderId}/workflows`,
        headers: { 'Idempotency-Key': idempotencyKey },
        data,
      },
      workflowMutationSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function listReminderWorkflows(reminderId: string): Promise<ReminderWorkflow[]> {
  try {
    const page = await requestWithAccessToken(
      { method: 'GET', url: `/reminders/${reminderId}/workflows` },
      workflowPageSchema,
    );
    return page.items;
  } catch (error) {
    throw toApiError(error);
  }
}

const workflowLifecycleMutationSchema = workflowSchema.extend({
  eventId: z.uuid(),
  idempotency: z.object({ key: z.string(), replayed: z.boolean() }).strict(),
});

export async function updateReminderWorkflowLifecycle(input: {
  workflowId: string;
  expectedRevision: number;
  lifecycle: 'ACTIVE' | 'PAUSED';
  idempotencyKey: string;
}): Promise<ReminderWorkflow> {
  const { workflowId, idempotencyKey, ...data } = input;
  try {
    return await requestWithAccessToken(
      {
        method: 'PATCH',
        url: `/workflows/${workflowId}/lifecycle`,
        headers: { 'Idempotency-Key': idempotencyKey },
        data,
      },
      workflowLifecycleMutationSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

const triggerMutationSchema = contextTriggerSchema.extend({
  reminderRevision: z.number().int().positive(),
  eventId: z.uuid(),
  idempotency: z.object({ key: z.string(), replayed: z.boolean() }).strict(),
});
const triggerPageSchema = z.object({ items: z.array(contextTriggerSchema) }).strict();

export async function createContextTrigger(input: {
  reminderId: string;
  expectedReminderRevision: number;
  type: 'LOCATION_ARRIVE' | 'LOCATION_LEAVE' | 'WIFI_CONNECT';
  label: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  networkName?: string;
  cooldownSeconds?: number;
  idempotencyKey: string;
}): Promise<ContextTrigger> {
  const { reminderId, idempotencyKey, ...data } = input;
  try {
    return await requestWithAccessToken(
      {
        method: 'POST',
        url: `/reminders/${reminderId}/context-triggers`,
        headers: { 'Idempotency-Key': idempotencyKey },
        data,
      },
      triggerMutationSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function listContextTriggers(reminderId?: string): Promise<ContextTrigger[]> {
  try {
    const page = await requestWithAccessToken(
      {
        method: 'GET',
        url: reminderId ? `/reminders/${reminderId}/context-triggers` : '/context-triggers',
      },
      triggerPageSchema,
    );
    return page.items;
  } catch (error) {
    throw toApiError(error);
  }
}

const triggerLifecycleMutationSchema = contextTriggerSchema.extend({
  eventId: z.uuid(),
  idempotency: z.object({ key: z.string(), replayed: z.boolean() }).strict(),
});

export async function updateContextTriggerLifecycle(input: {
  triggerId: string;
  expectedRevision: number;
  lifecycle: 'ACTIVE' | 'PAUSED';
  idempotencyKey: string;
}): Promise<ContextTrigger> {
  const { triggerId, idempotencyKey, ...data } = input;
  try {
    return await requestWithAccessToken(
      {
        method: 'PATCH',
        url: `/context-triggers/${triggerId}/lifecycle`,
        headers: { 'Idempotency-Key': idempotencyKey },
        data,
      },
      triggerLifecycleMutationSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

const triggerEventResultSchema = z
  .object({
    evaluationId: z.uuid(),
    triggerId: z.uuid(),
    outcome: z.enum(['FIRED', 'SUPPRESSED', 'REJECTED']),
    reason: z.string().nullable(),
    reminder: z.unknown().nullable(),
    replayed: z.boolean(),
  })
  .strict();

export async function reportContextTriggerEvent(input: {
  triggerId: string;
  installationId: string;
  eventKey: string;
  occurredAt: string;
  networkName?: string;
}) {
  const { triggerId, ...data } = input;
  try {
    return await requestWithAccessToken(
      { method: 'POST', url: `/context-triggers/${triggerId}/events`, data },
      triggerEventResultSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function previewTimezoneChange(
  proposedTimezone: string,
): Promise<TimezonePreview> {
  try {
    return await requestWithAccessToken(
      {
        method: 'POST',
        url: '/reminders/timezone-preview',
        data: { proposedTimezone },
      },
      timezonePreviewSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

const mutationResultSchema = z.object({ idempotency: z.object({ replayed: z.boolean() }) }).passthrough();

export async function editReminderSchedule(input: {
  reminderId: string;
  idempotencyKey: string;
  occurrenceId: string;
  scope: 'THIS_OCCURRENCE' | 'THIS_AND_FUTURE';
  expectedReminderRevision: number;
  expectedEffectiveScheduledAt: string;
  schedule: ReminderScheduleInput;
}) {
  const { reminderId, idempotencyKey, ...data } = input;
  try {
    return await requestWithAccessToken(
      {
        method: 'PATCH',
        url: `/reminders/${reminderId}/schedule`,
        headers: { 'Idempotency-Key': idempotencyKey },
        data,
      },
      mutationResultSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function snoozeOccurrence(input: {
  occurrenceId: string;
  idempotencyKey: string;
  until: string;
  expectedScheduleRevision: number;
  expectedEffectiveScheduledAt: string;
}) {
  const { occurrenceId, idempotencyKey, ...data } = input;
  try {
    return await requestWithAccessToken(
      {
        method: 'POST',
        url: `/reminder-occurrences/${occurrenceId}/snooze`,
        headers: { 'Idempotency-Key': idempotencyKey },
        data,
      },
      mutationResultSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export function createIdempotencyKey(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 12);
  return `${prefix}:${Date.now().toString(36)}:${random}`;
}
