import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', maxLength: 320 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({ allow_utf8_local_part: false })
  @MaxLength(320)
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ example: 'Sam’s iPhone', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}
