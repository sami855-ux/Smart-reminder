import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  emailVerifiedAt!: string | null;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ writeOnly: true })
  refreshToken!: string;

  @ApiProperty({ example: 900 })
  accessTokenExpiresInSeconds!: number;

  @ApiProperty({ format: 'date-time' })
  refreshTokenExpiresAt!: string;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}
