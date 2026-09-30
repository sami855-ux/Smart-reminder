import { z } from 'zod';

import { requestWithAccessToken } from '../api/client';
import { toApiError } from '../api/errors';

const notificationAttemptResultSchema = z
  .object({
    id: z.uuid().nullable(),
    eventId: z.uuid(),
    idempotency: z.object({ key: z.string(), replayed: z.boolean() }).strict(),
  })
  .passthrough();

export type NotificationOutcome =
  | 'REQUESTED'
  | 'LOCALLY_SCHEDULED'
  | 'SCHEDULING_FAILED'
  | 'CANCELLED'
  | 'OPENED'
  | 'ACTED_ON';

export async function reportNotificationAttempt(
  input: {
    occurrenceId: string;
    deviceInstallationId: string;
    scheduleRevision: number;
    effectiveScheduledAt: string;
    nudgeStep: 0 | 1;
    outcome: NotificationOutcome;
    osNotificationId?: string;
    errorCode?: string;
  },
  idempotencyKey: string,
) {
  try {
    return await requestWithAccessToken(
      {
        method: 'POST',
        url: '/notification-attempts',
        headers: { 'Idempotency-Key': idempotencyKey },
        data: input,
      },
      notificationAttemptResultSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export function notificationAttemptKey(
  occurrenceId: string,
  outcome: NotificationOutcome,
  nudgeStep: 0 | 1 = 0,
): string {
  return `notification:${outcome.toLowerCase()}:n${nudgeStep}:${occurrenceId}:${Date.now().toString(36)}`;
}
