import { z } from 'zod';

const scheduleTypeSchema = z.enum([
  'ONE_TIME',
  'DAILY',
  'WEEKLY',
  'SELECTED_WEEKDAYS',
]);

const warningSchema = z.object({
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(500),
  clause: z.string().min(1).max(500).nullable(),
});

const ambiguitySchema = z.object({
  field: z.enum(['title', 'date', 'time', 'recurrence']),
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(500),
  alternativeIds: z.array(z.string().min(1).max(80)).max(12),
});

const alternativeSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  patch: z.object({
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
    type: scheduleTypeSchema.optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  }),
});

const resolvedPreviewSchema = z.object({
  type: scheduleTypeSchema,
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1).max(100),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  resolvedAt: z.string().datetime(),
  utcOffsetMinutes: z.number().int().min(-840).max(840),
  recurrenceSummary: z.string().min(1).max(200),
  firstOccurrence: z.object({
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    scheduledAt: z.string().datetime(),
  }),
  adjustments: z.array(
    z.object({
      code: z.literal('DST_GAP_MOVED_FORWARD'),
      message: z.string().min(1).max(500),
      requestedLocalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      requestedLocalTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    }),
  ).max(1),
});

export const parseReminderResponseSchema = z.object({
  status: z.enum(['SUCCESS', 'NEEDS_CLARIFICATION', 'UNAVAILABLE']),
  draft: z.object({
    originalText: z.string().min(1).max(2000),
    preserved: z.literal(true),
    manualFormAvailable: z.literal(true),
  }),
  structured: z.object({
    title: z.string().min(1).max(120).nullable(),
    contextNote: z.string().max(2000).nullable(),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable(),
    timezone: z.string().min(1).max(100),
    recurrence: z.object({
      type: scheduleTypeSchema,
      weekdays: z.array(z.number().int().min(0).max(6)).max(7),
      summary: z.string().min(1).max(200),
    }),
  }).nullable(),
  preview: resolvedPreviewSchema.nullable(),
  confidence: z.object({
    title: z.number().min(0).max(1),
    date: z.number().min(0).max(1),
    time: z.number().min(0).max(1),
    timezone: z.number().min(0).max(1),
    recurrence: z.number().min(0).max(1),
  }),
  inferredFields: z.array(z.enum(['title', 'date', 'time', 'timezone', 'recurrence'])).max(5),
  ambiguities: z.array(ambiguitySchema).max(20),
  warnings: z.array(warningSchema).max(20),
  supportedAlternatives: z.array(alternativeSchema).max(20),
  requiresConfirmation: z.literal(true),
  created: z.literal(false),
});

export type ParseReminderResponse = z.infer<typeof parseReminderResponseSchema>;
