import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ writeOnly: true, minLength: 43, maxLength: 128 })
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/)
  refreshToken!: string;
}
