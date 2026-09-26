import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReminderScheduleTypeDto } from './reminder-schedule.dto.js';

export class FirstOccurrencePreviewDto {
  @ApiProperty({ example: '2026-09-27' })
  localDate!: string;

  @ApiProperty({ example: '09:00' })
  localTime!: string;

  @ApiProperty({ format: 'date-time' })
  scheduledAt!: string;
}

export class ScheduleAdjustmentDto {
  @ApiProperty({ enum: ['DST_GAP_MOVED_FORWARD'] })
  code!: 'DST_GAP_MOVED_FORWARD';

  @ApiProperty()
  message!: string;

  @ApiProperty()
  requestedLocalDate!: string;

  @ApiProperty()
  requestedLocalTime!: string;
}

export class ResolvedScheduleDto {
  @ApiProperty({ enum: ReminderScheduleTypeDto })
  type!: ReminderScheduleTypeDto;

  @ApiProperty()
  localDate!: string;

  @ApiProperty()
  localTime!: string;

  @ApiProperty()
  timezone!: string;

  @ApiProperty({ type: [Number] })
  weekdays!: number[];

  @ApiPropertyOptional({ nullable: true })
  endDate!: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 500 })
  occurrenceCount!: number | null;

  @ApiProperty({ format: 'date-time' })
  resolvedAt!: string;

  @ApiProperty()
  utcOffsetMinutes!: number;

  @ApiProperty()
  recurrenceSummary!: string;

  @ApiProperty({ type: FirstOccurrencePreviewDto })
  firstOccurrence!: FirstOccurrencePreviewDto;

  @ApiProperty({ type: [ScheduleAdjustmentDto] })
  adjustments!: ScheduleAdjustmentDto[];
}

export class ReminderPreviewResponseDto {
  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  contextNote!: string | null;

  @ApiProperty({ type: ResolvedScheduleDto })
  schedule!: ResolvedScheduleDto;

  @ApiProperty({ example: true })
  requiresConfirmation!: true;

  @ApiProperty({ example: false })
  persisted!: false;
}

export class StoredScheduleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ReminderScheduleTypeDto })
  type!: ReminderScheduleTypeDto;

  @ApiProperty()
  localDate!: string;

  @ApiProperty()
  localTime!: string;

  @ApiProperty()
  timezone!: string;

  @ApiProperty({ type: [Number] })
  weekdays!: number[];

  @ApiPropertyOptional({ nullable: true })
  endDate!: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 500 })
  occurrenceCount!: number | null;

  @ApiProperty({ format: 'date-time' })
  resolvedAt!: string;

  @ApiProperty()
  utcOffsetMinutes!: number;

  @ApiProperty()
  revision!: number;

  @ApiProperty({ format: 'date-time' })
  materializedThrough!: string;
}

export class StoredOccurrenceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  scheduleId!: string;

  @ApiProperty()
  scheduleRevision!: number;

  @ApiProperty({ enum: ['SCHEDULED', 'COMPLETED', 'SKIPPED', 'CANCELLED'] })
  lifecycle!: string;

  @ApiProperty()
  localDate!: string;

  @ApiProperty()
  localTime!: string;

  @ApiProperty({ format: 'date-time' })
  originalScheduledAt!: string;

  @ApiProperty({ format: 'date-time' })
  effectiveScheduledAt!: string;
}

export class IdempotencyResultDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  replayed!: boolean;
}

export class CreatedReminderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  contextNote!: string | null;

  @ApiProperty({ enum: ['ACTIVE', 'CANCELLED', 'ARCHIVED'] })
  lifecycle!: string;

  @ApiProperty()
  revision!: number;

  @ApiProperty({ type: StoredScheduleDto })
  schedule!: StoredScheduleDto;

  @ApiProperty({ type: StoredOccurrenceDto })
  firstOccurrence!: StoredOccurrenceDto;

  @ApiProperty({ type: IdempotencyResultDto })
  idempotency!: IdempotencyResultDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ParseReminderResponseDto {
  @ApiProperty({ enum: ['SUCCESS', 'NEEDS_CLARIFICATION', 'UNAVAILABLE'] })
  status!: string;

  @ApiProperty({
    description: 'Original input is returned so the client can preserve the editable draft.',
    example: {
      originalText: 'Remind me tomorrow at 9 to call John.',
      preserved: true,
      manualFormAvailable: true,
    },
  })
  draft!: Record<string, unknown>;

  @ApiProperty({
    nullable: true,
    description: 'Bounded editable fields. Missing ambiguous fields are null.',
  })
  structured!: Record<string, unknown> | null;

  @ApiProperty({ type: ResolvedScheduleDto, nullable: true })
  preview!: ResolvedScheduleDto | null;

  @ApiProperty({ description: 'Per-field confidence values in the inclusive range 0–1.' })
  confidence!: Record<string, number>;

  @ApiProperty({ type: [String] })
  inferredFields!: string[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Required user clarifications with references to supported alternatives.',
  })
  ambiguities!: Array<Record<string, unknown>>;

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Unsupported clauses and non-blocking parser warnings; clauses remain visible.',
  })
  warnings!: Array<Record<string, unknown>>;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  supportedAlternatives!: Array<Record<string, unknown>>;

  @ApiProperty({ example: true })
  requiresConfirmation!: true;

  @ApiProperty({ example: false })
  created!: false;
}
