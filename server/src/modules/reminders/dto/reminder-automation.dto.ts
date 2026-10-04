import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { UnicodeLength } from './unicode-length.validator.js';
import { RFC3339_INSTANT_MESSAGE, RFC3339_INSTANT_PATTERN } from './rfc3339-instant.js';

const normalizeLine = (value: unknown) =>
  typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/gu, ' ') : value;

export class ChecklistDefinitionItemDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ minLength: 1, maxLength: 240 })
  @IsString()
  @Transform(({ value }) => normalizeLine(value))
  @UnicodeLength(1, 240, { message: 'checklist item text must contain 1–240 Unicode characters' })
  text!: string;
}

export class ReplaceChecklistDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedReminderRevision!: number;

  @ApiProperty({ type: [ChecklistDefinitionItemDto], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChecklistDefinitionItemDto)
  items!: ChecklistDefinitionItemDto[];
}

export class ToggleChecklistItemDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @ApiProperty()
  @IsBoolean()
  checked!: boolean;
}

export enum WorkflowStepConditionDto {
  PREVIOUS_COMPLETED = 'PREVIOUS_COMPLETED',
  ALL_CHECKLIST_COMPLETED = 'ALL_CHECKLIST_COMPLETED',
}

export class CreateWorkflowStepDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @Transform(({ value }) => normalizeLine(value))
  @UnicodeLength(1, 120)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @UnicodeLength(0, 2000)
  contextNote?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 43200, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(43_200)
  delayMinutes = 0;

  @ApiPropertyOptional({ enum: WorkflowStepConditionDto, default: WorkflowStepConditionDto.PREVIOUS_COMPLETED })
  @IsOptional()
  @IsEnum(WorkflowStepConditionDto)
  condition: WorkflowStepConditionDto = WorkflowStepConditionDto.PREVIOUS_COMPLETED;
}

export class CreateWorkflowDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedReminderRevision!: number;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @Transform(({ value }) => normalizeLine(value))
  @UnicodeLength(1, 120)
  name!: string;

  @ApiProperty({ type: [CreateWorkflowStepDto], minItems: 1, maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateWorkflowStepDto)
  steps!: CreateWorkflowStepDto[];
}

export enum ContextTriggerTypeDto {
  LOCATION_ARRIVE = 'LOCATION_ARRIVE',
  LOCATION_LEAVE = 'LOCATION_LEAVE',
  WIFI_CONNECT = 'WIFI_CONNECT',
}

export class CreateContextTriggerDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedReminderRevision!: number;

  @ApiProperty({ enum: ContextTriggerTypeDto })
  @IsEnum(ContextTriggerTypeDto)
  type!: ContextTriggerTypeDto;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @Transform(({ value }) => normalizeLine(value))
  @UnicodeLength(1, 120)
  label!: string;

  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @ValidateIf((value: CreateContextTriggerDto) => value.type !== ContextTriggerTypeDto.WIFI_CONNECT)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @ValidateIf((value: CreateContextTriggerDto) => value.type !== ContextTriggerTypeDto.WIFI_CONNECT)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ minimum: 50, maximum: 5000 })
  @ValidateIf((value: CreateContextTriggerDto) => value.type !== ContextTriggerTypeDto.WIFI_CONNECT)
  @IsInt()
  @Min(50)
  @Max(5_000)
  radiusMeters?: number;

  @ApiPropertyOptional({ minLength: 1, maxLength: 128, writeOnly: true })
  @ValidateIf((value: CreateContextTriggerDto) => value.type === ContextTriggerTypeDto.WIFI_CONNECT)
  @IsString()
  @Transform(({ value }) => normalizeLine(value))
  @UnicodeLength(1, 128)
  networkName?: string;

  @ApiPropertyOptional({ minimum: 60, maximum: 86400, default: 300 })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86_400)
  cooldownSeconds = 300;
}

export class ReportTriggerEventDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  installationId!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @Matches(/^[A-Za-z0-9._:-]+$/u)
  @UnicodeLength(8, 128)
  eventKey!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  @Matches(RFC3339_INSTANT_PATTERN, { message: `occurredAt ${RFC3339_INSTANT_MESSAGE}` })
  occurredAt!: string;

  @ApiPropertyOptional({ maxLength: 128, writeOnly: true })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeLine(value))
  @UnicodeLength(1, 128)
  networkName?: string;
}
