import { z } from 'zod';

export const scheduleTypeSchema = z.enum([
  'ONE_TIME',
  'DAILY',
  'WEEKLY',
  'SELECTED_WEEKDAYS',
]);

export const reminderScheduleInputSchema = z
  .object({
    type: scheduleTypeSchema,
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u),
    timezone: z.string().min(1).max(100),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
    occurrenceCount: z.number().int().min(1).max(500).optional(),
  })
  .strict();

const firstOccurrenceSchema = z
  .object({
    localDate: z.string(),
    localTime: z.string(),
    scheduledAt: z.string().datetime(),
  })
  .strict();

export const resolvedScheduleSchema = z
  .object({
    type: scheduleTypeSchema,
    localDate: z.string(),
    localTime: z.string(),
    timezone: z.string(),
    weekdays: z.array(z.number().int()),
    endDate: z.string().nullable().optional(),
    occurrenceCount: z.number().int().nullable().optional(),
    resolvedAt: z.string().datetime(),
    utcOffsetMinutes: z.number().int(),
    recurrenceSummary: z.string(),
    firstOccurrence: firstOccurrenceSchema,
    adjustments: z.array(
      z
        .object({
          code: z.literal('DST_GAP_MOVED_FORWARD'),
          message: z.string(),
          requestedLocalDate: z.string(),
          requestedLocalTime: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export const reminderPreviewSchema = z
  .object({
    title: z.string(),
    contextNote: z.string().nullable(),
    schedule: resolvedScheduleSchema,
    requiresConfirmation: z.literal(true),
    persisted: z.literal(false),
  })
  .strict();

const storedScheduleSchema = z
  .object({
    id: z.uuid(),
    type: scheduleTypeSchema,
    localDate: z.string(),
    localTime: z.string(),
    timezone: z.string(),
    weekdays: z.array(z.number().int()),
    endDate: z.string().nullable(),
    occurrenceCount: z.number().int().nullable(),
    resolvedAt: z.string().datetime(),
    utcOffsetMinutes: z.number().int(),
    revision: z.number().int().positive(),
    materializedThrough: z.string().datetime(),
  })
  .strict();

export const storedOccurrenceSchema = z
  .object({
    id: z.uuid(),
    scheduleId: z.uuid(),
    scheduleRevision: z.number().int().positive(),
    sequence: z.number().int().positive().optional(),
    lifecycle: z.enum(['SCHEDULED', 'COMPLETED', 'SKIPPED', 'CANCELLED']),
    localDate: z.string(),
    localTime: z.string(),
    originalScheduledAt: z.string().datetime(),
    effectiveScheduledAt: z.string().datetime(),
  })
  .strict();

export const createdReminderSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    contextNote: z.string().nullable(),
    lifecycle: z.enum(['ACTIVE', 'CANCELLED', 'ARCHIVED']),
    revision: z.number().int().positive(),
    schedule: storedScheduleSchema,
    firstOccurrence: storedOccurrenceSchema,
    idempotency: z.object({ key: z.string(), replayed: z.boolean() }).strict(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const occurrenceListItemSchema = z
  .object({
    id: z.uuid(),
    reminderId: z.uuid(),
    title: z.string(),
    contextNote: z.string().nullable(),
    reminderRevision: z.number().int().positive(),
    scheduleId: z.uuid(),
    scheduleRevision: z.number().int().positive(),
    scheduleType: scheduleTypeSchema,
    timezone: z.string(),
    weekdays: z.array(z.number().int()),
    sequence: z.number().int().positive(),
    lifecycle: z.literal('SCHEDULED'),
    localDate: z.string(),
    localTime: z.string(),
    originalScheduledAt: z.string().datetime(),
    effectiveScheduledAt: z.string().datetime(),
  })
  .strict();

export const occurrencePageSchema = z
  .object({
    items: z.array(occurrenceListItemSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const reminderDetailSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    contextNote: z.string().nullable(),
    lifecycle: z.enum(['ACTIVE', 'CANCELLED', 'ARCHIVED']),
    revision: z.number().int().positive(),
    schedule: storedScheduleSchema,
    occurrences: z.array(storedOccurrenceSchema.extend({ sequence: z.number().int().positive() })),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const timezonePreviewSchema = z
  .object({
    proposedTimezone: z.string(),
    policy: z.literal('PRESERVE_SCHEDULE_TIMEZONE'),
    persisted: z.literal(false),
    schedules: z.array(
      z
        .object({
          reminderId: z.uuid(),
          reminderRevision: z.number().int().positive(),
          scheduleId: z.uuid(),
          scheduleRevision: z.number().int().positive(),
          original: z.object({
            localDate: z.string(),
            localTime: z.string(),
            timezone: z.string(),
            resolvedAt: z.string().datetime(),
            utcOffsetMinutes: z.number().int(),
          }),
          nextOccurrenceAt: z.string().datetime(),
          displayInProposedTimezone: z.object({
            localDate: z.string(),
            localTime: z.string(),
            timezone: z.string(),
          }),
          scheduleTimezoneChanges: z.literal(false),
          confirmedInstantChanges: z.literal(false),
        })
        .strict(),
    ),
  })
  .strict();

export const parseReminderResponseSchema = z
  .object({
    status: z.enum(['SUCCESS', 'NEEDS_CLARIFICATION', 'UNAVAILABLE']),
    draft: z.object({
      originalText: z.string(),
      preserved: z.literal(true),
      manualFormAvailable: z.literal(true),
    }),
    structured: z
      .object({
        title: z.string().nullable(),
        contextNote: z.string().nullable(),
        localDate: z.string().nullable(),
        localTime: z.string().nullable(),
        timezone: z.string(),
        recurrence: z.object({
          type: scheduleTypeSchema,
          weekdays: z.array(z.number().int()),
          summary: z.string(),
        }),
      })
      .nullable(),
    preview: resolvedScheduleSchema.nullable(),
    confidence: z.record(z.string(), z.number()),
    inferredFields: z.array(z.string()),
    ambiguities: z.array(z.object({ code: z.string(), message: z.string() }).passthrough()),
    warnings: z.array(z.object({ code: z.string(), message: z.string() }).passthrough()),
    supportedAlternatives: z.array(z.object({ id: z.string() }).passthrough()),
    requiresConfirmation: z.literal(true),
    created: z.literal(false),
  })
  .strict();

export type ReminderScheduleInput = z.infer<typeof reminderScheduleInputSchema>;
export type ReminderPreview = z.infer<typeof reminderPreviewSchema>;
export type CreatedReminder = z.infer<typeof createdReminderSchema>;
export type OccurrenceListItem = z.infer<typeof occurrenceListItemSchema>;
export type ReminderDetail = z.infer<typeof reminderDetailSchema>;
export type TimezonePreview = z.infer<typeof timezonePreviewSchema>;
export type ParseReminderResponse = z.infer<typeof parseReminderResponseSchema>;
