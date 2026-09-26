import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export enum ReminderScheduleTypeDto {
  ONE_TIME = 'ONE_TIME',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  SELECTED_WEEKDAYS = 'SELECTED_WEEKDAYS',
}

export enum WeekdayDto {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
}

export class ReminderScheduleDto {
  @ApiProperty({ enum: ReminderScheduleTypeDto })
  @IsEnum(ReminderScheduleTypeDto)
  type!: ReminderScheduleTypeDto;

  @ApiProperty({ example: '2026-09-27', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'localDate must use YYYY-MM-DD' })
  localDate!: string;

  @ApiProperty({ example: '09:00', pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$' })
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/, { message: 'localTime must use 24-hour HH:mm' })
  localTime!: string;

  @ApiProperty({ example: 'Africa/Addis_Ababa', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  timezone!: string;

  @ApiPropertyOptional({
    description: 'Required only for SELECTED_WEEKDAYS. Sunday is 0 and Saturday is 6.',
    enum: WeekdayDto,
    isArray: true,
    example: [1, 3, 5],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @IsEnum(WeekdayDto, { each: true })
  weekdays?: WeekdayDto[];

  @ApiPropertyOptional({
    description: 'Inclusive local end date for a finite recurring series.',
    example: '2026-12-31',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must use YYYY-MM-DD' })
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Maximum occurrences for a finite recurring series.',
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  occurrenceCount?: number;
}
