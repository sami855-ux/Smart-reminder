import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', maxLength: 320 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({ allow_utf8_local_part: false })
  @MaxLength(320)
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ example: 'Sam’s Android phone', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}
