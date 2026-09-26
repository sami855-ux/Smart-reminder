import { z } from 'zod';

import { requestWithAccessToken } from '../api/client';
import { toApiError } from '../api/errors';
import {
  createdReminderSchema,
  occurrencePageSchema,
  parseReminderResponseSchema,
  reminderDetailSchema,
  reminderPreviewSchema,
  timezonePreviewSchema,
  type CreatedReminder,
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
        headers: { 'Idempotency-Key': idempotencyKey },
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
  from: string;
  to: string;
  limit?: number;
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
