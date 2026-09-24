import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiAcceptedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { RequestMetadataService } from '../../common/security/request-metadata.service.js';
import { AuthService } from './auth.service.js';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { EmailRequestDto, TokenDto } from './dto/email.dto.js';
import { CompletePasswordResetDto, ConfirmPasswordDto } from './dto/password-reset.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly requestMetadata: RequestMetadataService,
  ) {}

  @Post('register')
  @Throttle({ network: { limit: 5, ttl: 60_000 }, account: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register an account and create the first device session' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  register(@Body() dto: RegisterDto, @Req() request: Request): Promise<AuthResponseDto> {
    return this.auth.register(dto, this.requestMetadata.fromRequest(request));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ network: { limit: 10, ttl: 60_000 }, account: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<AuthResponseDto> {
    return this.auth.login(dto, this.requestMetadata.fromRequest(request));
  }

  @Post('email-verification/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ network: { limit: 5, ttl: 60_000 }, account: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a new email-verification link' })
  @ApiAcceptedResponse()
  async requestEmailVerification(@CurrentUser() principal: AuthPrincipal): Promise<void> {
    await this.auth.requestEmailVerification(principal);
  }

  @Post('email-verification/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ network: { limit: 10, ttl: 60_000 }, account: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify email ownership with a one-time token' })
  @ApiNoContentResponse()
  async verifyEmail(@Body() dto: TokenDto): Promise<void> {
    await this.auth.verifyEmail(dto.token);
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ network: { limit: 5, ttl: 60_000 }, account: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Request a password-reset email; response is always generic' })
  @ApiAcceptedResponse()
  async requestPasswordReset(@Body() dto: EmailRequestDto, @Req() request: Request): Promise<void> {
    await this.auth.requestPasswordReset(dto.email, this.requestMetadata.fromRequest(request));
  }

  @Post('password-reset/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ network: { limit: 10, ttl: 60_000 }, account: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Set a new password with a one-time reset token' })
  @ApiNoContentResponse()
  async completePasswordReset(
    @Body() dto: CompletePasswordResetDto,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.completePasswordReset(
      dto.token,
      dto.newPassword,
      this.requestMetadata.fromRequest(request),
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ network: { limit: 30, ttl: 60_000 }, account: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rotate a refresh token and issue a new access token' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid, expired, or reused refresh token' })
  refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
  ): Promise<AuthResponseDto> {
    return this.auth.refresh(dto.refreshToken, this.requestMetadata.fromRequest(request));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current device session' })
  @ApiNoContentResponse()
  async logout(
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.logout(principal, this.requestMetadata.fromRequest(request));
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all sessions for the current account' })
  @ApiNoContentResponse()
  async logoutAll(
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.logoutAll(principal, this.requestMetadata.fromRequest(request));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the authenticated account identity' })
  @ApiOkResponse({ type: AuthUserDto })
  me(@CurrentUser() principal: AuthPrincipal): Promise<AuthUserDto> {
    return this.auth.me(principal);
  }

  @Get('export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export account and reminder data as versioned JSON' })
  @ApiOkResponse()
  exportData(@CurrentUser() principal: AuthPrincipal): Promise<Record<string, unknown>> {
    return this.auth.exportData(principal);
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ network: { limit: 5, ttl: 60_000 }, account: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Disable the account, revoke sessions, and schedule primary-data purge' })
  @ApiOkResponse()
  async deleteAccount(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: ConfirmPasswordDto,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    const purgeAfter = await this.auth.deleteAccount(
      principal,
      dto.password,
      this.requestMetadata.fromRequest(request),
    );
    return {
      status: 'DELETION_PENDING',
      purgeAfter: purgeAfter.toISOString(),
      cancelLocalNotifications: true,
      localSignOutRequired: true,
    };
  }
}
