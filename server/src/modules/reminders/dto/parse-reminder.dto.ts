import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsLocale,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { UnicodeLength } from './unicode-length.validator.js';
import {
  RFC3339_INSTANT_MESSAGE,
  RFC3339_INSTANT_PATTERN,
} from './rfc3339-instant.js';

export enum TimeFormatDto {
  TWELVE_HOUR = '12-hour',
  TWENTY_FOUR_HOUR = '24-hour',
}

export class ParseReminderDto {
  @ApiProperty({ example: 'Remind me tomorrow at 9 to call John.', maxLength: 2000 })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.normalize('NFC').trim() : value))
  @UnicodeLength(1, 2000, { message: 'text must contain 1–2,000 Unicode characters' })
  text!: string;

  @ApiProperty({ example: '2026-09-26T10:00:00.000Z', format: 'date-time' })
  @IsDateString({ strict: true })
  @Matches(RFC3339_INSTANT_PATTERN, {
    message: `referenceInstant ${RFC3339_INSTANT_MESSAGE}`,
  })
  referenceInstant!: string;

  @ApiProperty({ example: 'en-US', maxLength: 35 })
  @IsLocale()
  @MaxLength(35)
  locale!: string;

  @ApiProperty({ example: 'Africa/Addis_Ababa', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  timezone!: string;

  @ApiProperty({ enum: TimeFormatDto })
  @IsEnum(TimeFormatDto)
  timeFormat!: TimeFormatDto;
}
