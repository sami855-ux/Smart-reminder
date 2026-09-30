import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { normalizeContextNote, normalizeTitle } from './reminder-create.dto.js';
import { RFC3339_INSTANT_MESSAGE, RFC3339_INSTANT_PATTERN } from './rfc3339-instant.js';
import { UnicodeLength } from './unicode-length.validator.js';

export class OccurrenceActionDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedScheduleRevision!: number;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  @Matches(RFC3339_INSTANT_PATTERN, {
    message: `expectedEffectiveScheduledAt ${RFC3339_INSTANT_MESSAGE}`,
  })
  expectedEffectiveScheduledAt!: string;
}

export class UpdateReminderContentDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeTitle(value))
  @UnicodeLength(1, 120, { message: 'title must contain 1–120 Unicode characters' })
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Transform(({ value }) => (value === null ? null : normalizeContextNote(value)))
  @UnicodeLength(0, 2000, { message: 'contextNote must contain at most 2,000 Unicode characters' })
  contextNote?: string | null;
}

export class DeleteReminderDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class UpdateNudgePolicyDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedReminderRevision!: number;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({ minimum: 5, maximum: 1440 })
  @ValidateIf((object: UpdateNudgePolicyDto) => object.enabled)
  @IsInt()
  @Min(5)
  @Max(1440)
  intervalMinutes?: number;
}

export enum OccurrenceListViewDto {
  UPCOMING = 'UPCOMING',
  OVERDUE = 'OVERDUE',
  COMPLETED = 'COMPLETED',
  ALL = 'ALL',
}

export class OccurrenceListViewFilterDto {
  @ApiPropertyOptional({ enum: OccurrenceListViewDto, default: OccurrenceListViewDto.UPCOMING })
  @IsOptional()
  @IsEnum(OccurrenceListViewDto)
  view: OccurrenceListViewDto = OccurrenceListViewDto.UPCOMING;
}
