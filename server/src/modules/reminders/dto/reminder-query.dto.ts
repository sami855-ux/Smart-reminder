import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  Matches,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  RFC3339_INSTANT_MESSAGE,
  RFC3339_INSTANT_PATTERN,
} from './rfc3339-instant.js';

export class ListReminderOccurrencesDto {
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
