import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  RegisterDeviceInstallationDto,
  ReportNotificationAttemptDto,
  UpdateNotificationPreferencesDto,
  UpdateProfilePreferencesDto,
} from './dto/notification.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('Notifications and devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('device-installations')
  @ApiOperation({ summary: 'List device installations owned by the signed-in account' })
  @ApiOkResponse({ description: 'Owned active and revoked installations' })
  listDevices(@CurrentUser() principal: AuthPrincipal) {
    return this.notifications.listDevices(principal.userId);
  }

  @Put('device-installations/:installationId')
  @ApiOperation({ summary: 'Register or reconcile one client-generated installation ID' })
  @ApiOkResponse({ description: 'Authoritative installation and revision' })
  @ApiConflictResponse({ description: 'Stale installation revision or revoked installation' })
  registerDevice(
    @CurrentUser() principal: AuthPrincipal,
    @Param('installationId', new ParseUUIDPipe()) installationId: string,
    @Body() dto: RegisterDeviceInstallationDto,
  ) {
    return this.notifications.registerDevice(principal, installationId, dto);
  }

  @Delete('device-installations/:installationId')
  @ApiOperation({ summary: 'Revoke a device and cancel its reported local notification mappings' })
  @ApiOkResponse({ description: 'Revoked installation; repeated requests are harmless' })
  revokeDevice(
    @CurrentUser() principal: AuthPrincipal,
    @Param('installationId', new ParseUUIDPipe()) installationId: string,
  ) {
    return this.notifications.revokeDevice(principal.userId, installationId);
  }

  @Get('notification-preferences')
  @ApiOperation({ summary: 'Get quiet-hours, privacy, timezone, and global-pause settings' })
  @ApiOkResponse({ description: 'Current preferences or revision-zero defaults' })
  getPreferences(@CurrentUser() principal: AuthPrincipal) {
    return this.notifications.getPreferences(principal.userId);
  }

  @Get('me/preferences')
  @ApiOperation({ summary: 'Get account locale, timezone, and 12/24-hour preference' })
  @ApiOkResponse({ description: 'Current profile preferences and revision' })
  getProfilePreferences(@CurrentUser() principal: AuthPrincipal) {
    return this.notifications.getProfilePreferences(principal.userId);
  }

  @Patch('me/preferences')
  @ApiOperation({ summary: 'Update account locale, timezone, and time format atomically' })
  @ApiOkResponse({ description: 'Updated profile preferences and revision' })
  @ApiConflictResponse({ description: 'Stale profile revision' })
  updateProfilePreferences(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: UpdateProfilePreferencesDto,
  ) {
    return this.notifications.updateProfilePreferences(principal.userId, dto);
  }

  @Patch('notification-preferences')
  @ApiOperation({ summary: 'Update notification preferences with optimistic concurrency' })
  @ApiOkResponse({ description: 'Updated preference revision' })
  @ApiConflictResponse({ description: 'Stale preference revision' })
  updatePreferences(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notifications.updatePreferences(principal, dto);
  }

  @Post('notification-attempts')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Report an idempotent local notification scheduling outcome' })
  @ApiOkResponse({ description: 'Authoritative logical attempt state' })
  reportAttempt(
    @CurrentUser() principal: AuthPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ReportNotificationAttemptDto,
  ) {
    return this.notifications.reportAttempt(principal, idempotencyKey, dto);
  }
}
