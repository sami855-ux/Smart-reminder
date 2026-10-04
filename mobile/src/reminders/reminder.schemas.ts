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

export const reminderChecklistTemplateSchema = z
  .object({
    id: z.uuid(),
    text: z.string(),
    position: z.number().int().nonnegative(),
    revision: z.number().int().positive(),
  })
  .strict();

export const occurrenceChecklistItemSchema = z
  .object({
    id: z.uuid(),
    sourceItemId: z.uuid().nullable(),
    text: z.string(),
    position: z.number().int().nonnegative(),
    checked: z.boolean(),
    checkedAt: z.string().datetime().nullable(),
    revision: z.number().int().positive(),
  })
  .strict();

export const createdReminderSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    contextNote: z.string().nullable(),
    lifecycle: z.enum(['ACTIVE', 'CANCELLED', 'ARCHIVED']),
    revision: z.number().int().positive(),
    checklist: z.array(reminderChecklistTemplateSchema),
    schedule: storedScheduleSchema,
    firstOccurrence: storedOccurrenceSchema.extend({
      sequence: z.number().int().positive(),
      checklist: z.array(occurrenceChecklistItemSchema),
      checklistProgress: z
        .object({ checked: z.number().int().nonnegative(), total: z.number().int().nonnegative() })
        .strict(),
    }),
    occurrences: z.array(
      storedOccurrenceSchema.extend({
        sequence: z.number().int().positive(),
        checklist: z.array(occurrenceChecklistItemSchema),
        checklistProgress: z
          .object({ checked: z.number().int().nonnegative(), total: z.number().int().nonnegative() })
          .strict(),
      }),
    ),
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
    lifecycle: z.enum(['SCHEDULED', 'COMPLETED', 'SKIPPED', 'CANCELLED']),
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
    checklist: z.array(reminderChecklistTemplateSchema),
    schedule: storedScheduleSchema,
    occurrences: z.array(
      storedOccurrenceSchema.extend({
        sequence: z.number().int().positive(),
        checklist: z.array(occurrenceChecklistItemSchema),
        checklistProgress: z
          .object({ checked: z.number().int().nonnegative(), total: z.number().int().nonnegative() })
          .strict(),
      }),
    ),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const workflowSchema = z
  .object({
    id: z.uuid(),
    sourceReminderId: z.uuid(),
    name: z.string(),
    lifecycle: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']),
    revision: z.number().int().positive(),
    steps: z.array(
      z
        .object({
          id: z.uuid(),
          position: z.number().int().positive(),
          title: z.string(),
          contextNote: z.string().nullable(),
          delayMinutes: z.number().int().nonnegative(),
          condition: z.enum(['PREVIOUS_COMPLETED', 'ALL_CHECKLIST_COMPLETED']),
        })
        .strict(),
    ),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const contextTriggerSchema = z
  .object({
    id: z.uuid(),
    reminderId: z.uuid(),
    type: z.enum(['LOCATION_ARRIVE', 'LOCATION_LEAVE', 'WIFI_CONNECT']),
    lifecycle: z.enum(['ACTIVE', 'PAUSED', 'UNAVAILABLE']),
    label: z.string(),
    location: z
      .object({
        latitude: z.number(),
        longitude: z.number(),
        radiusMeters: z.number().int(),
      })
      .strict()
      .nullable(),
    network: z.object({ configured: z.literal(true) }).strict().nullable(),
    cooldownSeconds: z.number().int().positive(),
    revision: z.number().int().positive(),
    lastTriggeredAt: z.string().datetime().nullable(),
    unavailableReason: z.string().nullable(),
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

export const occurrenceActionResultSchema = z
  .object({
    occurrenceId: z.uuid(),
    reminderId: z.uuid(),
    lifecycle: z.enum(['COMPLETED', 'SKIPPED']).nullable(),
    effectiveScheduledAt: z.string().datetime().nullable(),
    reminderLifecycle: z.enum(['ACTIVE', 'CANCELLED', 'ARCHIVED']).nullable(),
    eventId: z.uuid(),
    activatedReminders: z
      .array(z.object({ reminderId: z.uuid(), occurrenceId: z.uuid() }).strict())
      .optional(),
    idempotency: z.object({ key: z.string(), replayed: z.boolean() }).strict(),
  })
  .strict();

export const reminderMutationResultSchema = z
  .object({
    reminderId: z.uuid(),
    revision: z.number().int().positive().optional(),
    lifecycle: z.enum(['ACTIVE', 'CANCELLED', 'ARCHIVED']).optional(),
    purgeAfter: z.string().datetime().optional(),
    cancelledOccurrenceCount: z.number().int().nonnegative().optional(),
    eventId: z.uuid(),
    idempotency: z.object({ key: z.string(), replayed: z.boolean() }).strict(),
  })
  .passthrough();

export const nudgePolicySchema = z
  .object({
    reminderId: z.uuid(),
    reminderRevision: z.number().int().positive(),
    scheduleId: z.uuid(),
    scheduleRevision: z.number().int().positive(),
    enabled: z.boolean(),
    intervalMinutes: z.number().int().nullable(),
    invalidatedAt: z.string().datetime().nullable(),
    invalidationReason: z.string().nullable(),
    eventId: z.uuid().optional(),
    idempotency: z
      .object({ key: z.string(), replayed: z.boolean() })
      .strict()
      .optional(),
  })
  .strict();

export const reminderEventSchema = z
  .object({
    id: z.uuid(),
    reminderId: z.uuid(),
    occurrenceId: z.uuid().nullable(),
    actorType: z.enum(['USER', 'SYSTEM', 'DEVICE']),
    type: z.string(),
    metadata: z.unknown().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const reminderEventPageSchema = z
  .object({
    items: z.array(reminderEventSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const occurrenceExplanationSchema = z
  .object({
    occurrenceId: z.uuid(),
    reminderId: z.uuid(),
    reminderRevision: z.number().int().positive(),
    reminderLifecycle: z.enum(['ACTIVE', 'CANCELLED', 'ARCHIVED']),
    lifecycle: z.enum(['SCHEDULED', 'COMPLETED', 'SKIPPED', 'CANCELLED']),
    scheduleRevision: z.number().int().positive(),
    originalScheduledAt: z.string().datetime(),
    effectiveScheduledAt: z.string().datetime(),
    reason: z.string(),
    nudge: z
      .object({
        enabled: z.boolean(),
        intervalMinutes: z.number().int().nullable(),
      })
      .strict(),
  })
  .strict();

export type ReminderScheduleInput = z.infer<typeof reminderScheduleInputSchema>;
export type ReminderPreview = z.infer<typeof reminderPreviewSchema>;
export type CreatedReminder = z.infer<typeof createdReminderSchema>;
export type OccurrenceListItem = z.infer<typeof occurrenceListItemSchema>;
export type ReminderDetail = z.infer<typeof reminderDetailSchema>;
export type ReminderChecklistTemplate = z.infer<typeof reminderChecklistTemplateSchema>;
export type OccurrenceChecklistItem = z.infer<typeof occurrenceChecklistItemSchema>;
export type ReminderWorkflow = z.infer<typeof workflowSchema>;
export type ContextTrigger = z.infer<typeof contextTriggerSchema>;
export type TimezonePreview = z.infer<typeof timezonePreviewSchema>;
export type ParseReminderResponse = z.infer<typeof parseReminderResponseSchema>;
export type OccurrenceActionResult = z.infer<typeof occurrenceActionResultSchema>;
export type NudgePolicy = z.infer<typeof nudgePolicySchema>;
export type ReminderEvent = z.infer<typeof reminderEventSchema>;
export type OccurrenceExplanation = z.infer<typeof occurrenceExplanationSchema>;
