import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ReminderScheduleDto } from './reminder-schedule.dto.js';
import {
  RFC3339_INSTANT_MESSAGE,
  RFC3339_INSTANT_PATTERN,
} from './rfc3339-instant.js';

export class TimezonePreviewDto {
  @ApiProperty({ example: 'America/New_York', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  proposedTimezone!: string;
}

export enum RecurringEditScopeDto {
  THIS_OCCURRENCE = 'THIS_OCCURRENCE',
  THIS_AND_FUTURE = 'THIS_AND_FUTURE',
}

export class EditReminderScheduleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  occurrenceId!: string;

  @ApiProperty({ enum: RecurringEditScopeDto })
  @IsEnum(RecurringEditScopeDto)
  scope!: RecurringEditScopeDto;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedReminderRevision!: number;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  @Matches(RFC3339_INSTANT_PATTERN, {
    message: `expectedEffectiveScheduledAt ${RFC3339_INSTANT_MESSAGE}`,
  })
  expectedEffectiveScheduledAt!: string;

  @ApiProperty({ type: ReminderScheduleDto })
  @ValidateNested()
  @Type(() => ReminderScheduleDto)
  schedule!: ReminderScheduleDto;
}

export class SnoozeOccurrenceDto {
  @ApiProperty({ format: 'date-time', description: 'RFC 3339 instant, 5 minutes to 30 days ahead.' })
  @IsDateString({ strict: true })
  @Matches(RFC3339_INSTANT_PATTERN, { message: `until ${RFC3339_INSTANT_MESSAGE}` })
  until!: string;

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
