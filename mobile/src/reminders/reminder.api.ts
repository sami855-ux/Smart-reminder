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
  type CreatedReminder,
  type NudgePolicy,
  type OccurrenceActionResult,
  type OccurrenceExplanation,
  type ParseReminderResponse,
  type ReminderDetail,
  type ReminderPreview,
  type ReminderScheduleInput,
  type TimezonePreview,
} from './reminder.schemas';

export type ReminderContentInput = {
  title: string;
  contextNote?: string;
  schedule: ReminderScheduleInput;
};

export async function previewReminder(
  input: ReminderContentInput,
): Promise<ReminderPreview> {
  try {
    return await requestWithAccessToken(
      { method: 'POST', url: '/reminders/preview', data: input },
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
