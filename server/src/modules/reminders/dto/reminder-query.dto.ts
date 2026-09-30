import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  Matches,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OccurrenceListViewDto } from './reminder-action.dto.js';
import {
  RFC3339_INSTANT_MESSAGE,
  RFC3339_INSTANT_PATTERN,
} from './rfc3339-instant.js';

export class ListReminderOccurrencesDto {
  @ApiPropertyOptional({ enum: OccurrenceListViewDto, default: OccurrenceListViewDto.UPCOMING })
  @IsOptional()
  @IsEnum(OccurrenceListViewDto)
  view?: OccurrenceListViewDto;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(RFC3339_INSTANT_PATTERN, { message: `from ${RFC3339_INSTANT_MESSAGE}` })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(RFC3339_INSTANT_PATTERN, { message: `to ${RFC3339_INSTANT_MESSAGE}` })
  to?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 30;

  @ApiPropertyOptional({ description: 'Opaque cursor returned by the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}

export class ListReminderEventsDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;

  @ApiPropertyOptional({ description: 'Opaque cursor returned by the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}
