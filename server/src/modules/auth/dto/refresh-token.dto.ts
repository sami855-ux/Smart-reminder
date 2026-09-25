import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ writeOnly: true, minLength: 43, maxLength: 128 })
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  @Matches(
    /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.)?[A-Za-z0-9_-]{43}$/i,
  )
  refreshToken!: string;
}
