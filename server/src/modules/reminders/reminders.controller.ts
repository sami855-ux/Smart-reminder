import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  CreateReminderDto,
  PreviewReminderDto,
} from './dto/reminder-create.dto.js';
import { ParseReminderDto } from './dto/parse-reminder.dto.js';
import { ListReminderOccurrencesDto } from './dto/reminder-query.dto.js';
import {
  EditReminderScheduleDto,
  SnoozeOccurrenceDto,
  TimezonePreviewDto,
} from './dto/reminder-time.dto.js';
import {
  CreatedReminderResponseDto,
  ParseReminderResponseDto,
  ReminderPreviewResponseDto,
} from './dto/reminder-response.dto.js';
import { ReminderParserService } from './reminder-parser.service.js';
import { ReminderTimeService } from './reminder-time.service.js';
import { RemindersService } from './reminders.service.js';

@ApiTags('Reminders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class RemindersController {
  constructor(
    private readonly reminders: RemindersService,
    private readonly parser: ReminderParserService,
    private readonly time: ReminderTimeService,
  ) {}

  @Post('reminders/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve and validate a reminder schedule without persisting it' })
  @ApiOkResponse({
    description: 'Structured preview with recurrence and first occurrence',
    type: ReminderPreviewResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid, unsupported, or past schedule' })
  preview(@Body() dto: PreviewReminderDto) {
    return this.reminders.preview(dto);
  }

  @Post('reminders')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Stable 8–128 character key reused only for the same create intent',
  })
  @ApiOperation({ summary: 'Create one explicitly confirmed reminder atomically' })
  @ApiCreatedResponse({
    description: 'Created reminder, schedule, and first occurrence',
    type: CreatedReminderResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Missing confirmation, invalid key, or invalid schedule' })
  @ApiConflictResponse({ description: 'Idempotency key reused with a different request' })
  create(
    @CurrentUser() principal: AuthPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateReminderDto,
  ) {
    return this.reminders.create(principal, idempotencyKey, dto);
  }

  @Post('parse-reminder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Parse a bounded natural-language draft into an editable proposal without creating it',
  })
  @ApiOkResponse({
    description: 'Schema-validated proposal, confidence, ambiguities, warnings, and alternatives',
    type: ParseReminderResponseDto,
  })
  parse(@Body() dto: ParseReminderDto) {
    return this.parser.parse(dto);
  }

  @Get('reminder-occurrences')
  @ApiOperation({ summary: 'List the signed-in user’s scheduled reminder occurrences' })
  @ApiOkResponse({ description: 'Stable time-ordered occurrence page' })
  listOccurrences(
    @CurrentUser() principal: AuthPrincipal,
    @Query() query: ListReminderOccurrencesDto,
  ) {
    return this.reminders.listOccurrences(principal.userId, query);
  }

  @Get('reminders/:reminderId')
  @ApiOperation({ summary: 'Get one owned reminder with its current schedule and occurrences' })
  @ApiOkResponse({ description: 'Reminder detail' })
  getReminder(
    @CurrentUser() principal: AuthPrincipal,
    @Param('reminderId', new ParseUUIDPipe()) reminderId: string,
  ) {
    return this.reminders.getReminder(principal.userId, reminderId);
  }

  @Post('reminders/timezone-preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview how existing schedule instants display in a proposed account timezone',
  })
  @ApiOkResponse({ description: 'Read-only timezone impact preview; schedules are never rewritten' })
  previewTimezoneChange(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: TimezonePreviewDto,
  ) {
    return this.time.previewTimezoneChange(principal.userId, dto.proposedTimezone);
  }

  @Post('reminders/:reminderId/materialize-occurrences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Idempotently extend the current recurring occurrence horizon',
  })
  @ApiOkResponse({ description: 'Number of independently stored occurrences added' })
  materializeOccurrences(
    @CurrentUser() principal: AuthPrincipal,
    @Param('reminderId', new ParseUUIDPipe()) reminderId: string,
  ) {
    return this.time.materializeCurrentHorizon(principal.userId, reminderId);
  }

  @Patch('reminders/:reminderId/schedule')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({
    summary: 'Reschedule one occurrence or create a revision for this and future occurrences',
  })
  @ApiOkResponse({ description: 'Occurrence-only change or new schedule revision' })
  @ApiConflictResponse({ description: 'Stale reminder or occurrence revision' })
  editSchedule(
    @CurrentUser() principal: AuthPrincipal,
    @Param('reminderId', new ParseUUIDPipe()) reminderId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: EditReminderScheduleDto,
  ) {
    return this.time.editSchedule(principal, reminderId, idempotencyKey, dto);
  }

  @Post('reminder-occurrences/:occurrenceId/snooze')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Snooze exactly one occurrence without moving its series' })
  @ApiOkResponse({ description: 'Updated effective time for the selected occurrence only' })
  @ApiConflictResponse({ description: 'Stale or terminal occurrence' })
  snooze(
    @CurrentUser() principal: AuthPrincipal,
    @Param('occurrenceId', new ParseUUIDPipe()) occurrenceId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: SnoozeOccurrenceDto,
  ) {
    return this.time.snooze(principal, occurrenceId, idempotencyKey, dto);
  }
}
