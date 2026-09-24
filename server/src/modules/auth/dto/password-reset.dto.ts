import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CompletePasswordResetDto {
  @ApiProperty({ minLength: 32, maxLength: 256, writeOnly: true })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}

export class ConfirmPasswordDto {
  @ApiProperty({ minLength: 1, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
