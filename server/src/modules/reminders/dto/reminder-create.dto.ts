import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { ReminderScheduleDto } from './reminder-schedule.dto.js';
import {
  RFC3339_INSTANT_MESSAGE,
  RFC3339_INSTANT_PATTERN,
} from './rfc3339-instant.js';
import { UnicodeLength } from './unicode-length.validator.js';

export function normalizeTitle(value: unknown): unknown {
  return typeof value === 'string'
    ? value.normalize('NFC').trim().replace(/\s+/gu, ' ')
    : value;
}

export function normalizeContextNote(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const normalized = value.normalize('NFC').replace(/\r\n?/gu, '\n').trim();
  return normalized.length === 0 ? undefined : normalized;
}

export class ReminderContentDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @Transform(({ value }) => normalizeTitle(value))
  @UnicodeLength(1, 120, { message: 'title must contain 1–120 Unicode characters' })
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeContextNote(value))
  @UnicodeLength(0, 2000, { message: 'contextNote must contain at most 2,000 Unicode characters' })
  contextNote?: string;

  @ApiProperty({ type: ReminderScheduleDto })
  @ValidateNested()
  @Type(() => ReminderScheduleDto)
  schedule!: ReminderScheduleDto;
}

export class PreviewReminderDto extends ReminderContentDto {}

export class CreateReminderDto extends ReminderContentDto {
  @ApiProperty({
    description: 'Affirms that the user reviewed and explicitly confirmed the structured preview.',
    example: true,
  })
  @IsBoolean()
  @Equals(true, { message: 'confirmed must be true after the user reviews the preview' })
  confirmed!: true;

  @ApiProperty({
    description:
      'The resolved first-occurrence instant returned by preview and explicitly confirmed by the user.',
    example: '2026-09-27T06:00:00.000Z',
    format: 'date-time',
  })
  @IsDateString({ strict: true })
  @Matches(RFC3339_INSTANT_PATTERN, { message: `confirmedResolvedAt ${RFC3339_INSTANT_MESSAGE}` })
  confirmedResolvedAt!: string;
}
