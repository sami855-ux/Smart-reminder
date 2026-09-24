import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EmailRequestDto {
  @ApiProperty({ example: 'user@example.com', maxLength: 320 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({ allow_utf8_local_part: false })
  @MaxLength(320)
  email!: string;
}

export class TokenDto {
  @ApiProperty({ minLength: 32, maxLength: 256, writeOnly: true })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;
}
