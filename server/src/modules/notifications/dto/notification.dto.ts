import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  DevicePlatform,
  LockScreenPrivacy,
  NotificationPermissionState,
  TimeFormat,
} from '../../../generated/prisma/enums.js';
import { RFC3339_INSTANT_MESSAGE, RFC3339_INSTANT_PATTERN } from '../../reminders/dto/rfc3339-instant.js';

const CLOCK_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

export class RegisterDeviceInstallationDto {
  @ApiProperty({ enum: DevicePlatform })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @ApiProperty({ maxLength: 40 })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  appVersion!: string;

  @ApiProperty({ enum: NotificationPermissionState })
  @IsEnum(NotificationPermissionState)
  permissionState!: NotificationPermissionState;

  @ApiProperty({ maxLength: 35, example: 'en-US' })
  @IsString()
  @MinLength(2)
  @MaxLength(35)
  locale!: string;

  @ApiProperty({ maxLength: 100, example: 'Africa/Addis_Ababa' })
  @IsString()
  @MaxLength(100)
  timezone!: string;

  @ApiPropertyOptional({ minimum: 1, description: 'Required when updating an existing installation.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedRevision?: number;
}

export class UpdateNotificationPreferencesDto {
  @ApiProperty({ minimum: 0, description: 'Use 0 when creating preferences for the first time.' })
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @ApiPropertyOptional({ nullable: true, example: '22:00' })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Matches(CLOCK_TIME_PATTERN)
  quietHoursStart?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '07:00' })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Matches(CLOCK_TIME_PATTERN)
  quietHoursEnd?: string | null;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional({ enum: LockScreenPrivacy })
  @IsOptional()
  @IsEnum(LockScreenPrivacy)
  lockScreenPrivacy?: LockScreenPrivacy;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  globallyPaused?: boolean;
}

export class UpdateProfilePreferencesDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @ApiProperty({ maxLength: 35, example: 'en-US' })
  @IsString()
  @MinLength(2)
  @MaxLength(35)
  locale!: string;

  @ApiProperty({ maxLength: 100, example: 'Africa/Addis_Ababa' })
  @IsString()
  @MaxLength(100)
  timezone!: string;

  @ApiProperty({ enum: TimeFormat })
  @IsEnum(TimeFormat)
  timeFormat!: TimeFormat;
}

export enum NotificationOutcomeDto {
  REQUESTED = 'REQUESTED',
  LOCALLY_SCHEDULED = 'LOCALLY_SCHEDULED',
  SCHEDULING_FAILED = 'SCHEDULING_FAILED',
  CANCELLED = 'CANCELLED',
  OPENED = 'OPENED',
  ACTED_ON = 'ACTED_ON',
}

export class ReportNotificationAttemptDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  occurrenceId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  deviceInstallationId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  scheduleRevision!: number;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  @Matches(RFC3339_INSTANT_PATTERN, {
    message: `effectiveScheduledAt ${RFC3339_INSTANT_MESSAGE}`,
  })
  effectiveScheduledAt!: string;

  @ApiProperty({ enum: [0, 1] })
  @IsInt()
  @IsIn([0, 1])
  nudgeStep!: number;

  @ApiProperty({ enum: NotificationOutcomeDto })
  @IsEnum(NotificationOutcomeDto)
  outcome!: NotificationOutcomeDto;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  osNotificationId?: string;

  @ApiPropertyOptional({ maxLength: 80, description: 'Sanitized stable error code; never raw error text.' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_]{1,80}$/u)
  errorCode?: string;
}
