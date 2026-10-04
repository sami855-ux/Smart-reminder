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
import { ListReminderEventsDto, ListReminderOccurrencesDto } from './dto/reminder-query.dto.js';
import {
  DeleteReminderDto,
  OccurrenceActionDto,
  UpdateNudgePolicyDto,
  UpdateReminderContentDto,
} from './dto/reminder-action.dto.js';
import {
  CreateContextTriggerDto,
  CreateWorkflowDto,
  ReplaceChecklistDto,
  ReportTriggerEventDto,
  ToggleChecklistItemDto,
} from './dto/reminder-automation.dto.js';
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
import { ReminderActionsService } from './reminder-actions.service.js';
import { ReminderTimeService } from './reminder-time.service.js';
import { RemindersService } from './reminders.service.js';
import { ReminderChecklistService } from './reminder-checklist.service.js';
import { ReminderAutomationService } from './reminder-automation.service.js';

@ApiTags('Reminders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class RemindersController {
  constructor(
    private readonly reminders: RemindersService,
    private readonly parser: ReminderParserService,
    private readonly time: ReminderTimeService,
    private readonly actions: ReminderActionsService,
    private readonly checklist: ReminderChecklistService,
    private readonly automations: ReminderAutomationService,
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
  @ApiHeader({
    name: 'Prefer',
    required: false,
    description: 'Use return=representation to include materialized occurrences in the response',
  })
  @ApiOperation({ summary: 'Create one explicitly confirmed reminder atomically' })
  @ApiCreatedResponse({
    description: 'Created reminder with its schedule and materialized occurrences',
    type: CreatedReminderResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Missing confirmation, invalid key, or invalid schedule' })
  @ApiConflictResponse({ description: 'Idempotency key reused with a different request' })
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('prefer') prefer: string | undefined,
    @Body() dto: CreateReminderDto,
  ) {
    const created = await this.reminders.create(principal, idempotencyKey, dto);
    if (prefer?.split(',').some((value) => value.trim() === 'return=representation')) {
      return created;
    }
    return { ...created, occurrences: undefined };
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

  @Patch('reminders/:reminderId')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Update reminder content with optimistic concurrency' })
  @ApiOkResponse({ description: 'Updated reminder revision' })
  @ApiConflictResponse({ description: 'Stale reminder revision or idempotency conflict' })
  updateContent(
    @CurrentUser() principal: AuthPrincipal,
    @Param('reminderId', new ParseUUIDPipe()) reminderId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: UpdateReminderContentDto,
  ) {
    return this.actions.updateContent(principal, reminderId, idempotencyKey, dto);
  }

  @Patch('reminders/:reminderId/checklist')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Replace the reminder checklist template and future occurrence snapshots' })
  @ApiOkResponse({ description: 'Updated checklist template and reminder revision' })
  replaceChecklist(
    @CurrentUser() principal: AuthPrincipal,
    @Param('reminderId', new ParseUUIDPipe()) reminderId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ReplaceChecklistDto,
  ) {
    return this.checklist.replace(principal, reminderId, idempotencyKey, dto);
  }

  @Patch('reminder-occurrences/:occurrenceId/checklist-items/:itemId')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Check or uncheck one occurrence checklist item' })
  @ApiOkResponse({ description: 'Updated occurrence checklist item' })
  toggleChecklistItem(
    @CurrentUser() principal: AuthPrincipal,
    @Param('occurrenceId', new ParseUUIDPipe()) occurrenceId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ToggleChecklistItemDto,
  ) {
    return this.checklist.toggle(principal, occurrenceId, itemId, idempotencyKey, dto);
  }

  @Post('reminders/:reminderId/workflows')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Create a bounded sequential workflow that starts after completion' })
  @ApiCreatedResponse({ description: 'Workflow and ordered reminder steps' })
  createWorkflow(
    @CurrentUser() principal: AuthPrincipal,
    @Param('reminderId', new ParseUUIDPipe()) reminderId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateWorkflowDto,
  ) {
    return this.automations.createWorkflow(principal, reminderId, idempotencyKey, dto);
  }

  @Get('reminders/:reminderId/workflows')
  @ApiOperation({ summary: 'List workflows bound to a reminder' })
  listWorkflows(
    @CurrentUser() principal: AuthPrincipal,
    @Param('reminderId', new ParseUUIDPipe()) reminderId: string,
  ) {
    return this.automations.listWorkflows(principal.userId, reminderId);
  }

  @Post('reminders/:reminderId/context-triggers')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Create an encrypted location or keyed Wi-Fi trigger' })
  @ApiCreatedResponse({ description: 'Capability-aware context trigger' })
  createContextTrigger(
    @CurrentUser() principal: AuthPrincipal,
    @Param('reminderId', new ParseUUIDPipe()) reminderId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateContextTriggerDto,
  ) {
    return this.automations.createContextTrigger(principal, reminderId, idempotencyKey, dto);
  }

  @Get('context-triggers')
  @ApiOperation({ summary: 'List the current user context triggers for device reconciliation' })
  listAllContextTriggers(@CurrentUser() principal: AuthPrincipal) {
    return this.automations.listContextTriggers(principal.userId);
  }

  @Get('reminders/:reminderId/context-triggers')
  @ApiOperation({ summary: 'List context triggers attached to one reminder template' })
  listContextTriggers(
    @CurrentUser() principal: AuthPrincipal,
    @Param('reminderId', new ParseUUIDPipe()) reminderId: string,
  ) {
    return this.automations.listContextTriggers(principal.userId, reminderId);
  }

  @Post('context-triggers/:triggerId/events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Idempotently report a device-observed context trigger event' })
  reportContextTriggerEvent(
    @CurrentUser() principal: AuthPrincipal,
    @Param('triggerId', new ParseUUIDPipe()) triggerId: string,
    @Body() dto: ReportTriggerEventDto,
  ) {
    return this.automations.reportTriggerEvent(principal, triggerId, dto);
  }

  @Delete('reminders/:reminderId')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Cancel and schedule purge of an owned reminder' })
  @ApiOkResponse({ description: 'Reminder cancelled and local notifications invalidated' })
  @ApiConflictResponse({ description: 'Stale reminder revision or idempotency conflict' })
  deleteReminder(
    @CurrentUser() principal: AuthPrincipal,
    @Param('reminderId', new ParseUUIDPipe()) reminderId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: DeleteReminderDto,
  ) {
    return this.actions.deleteReminder(principal, reminderId, idempotencyKey, dto);
  }

  @Get('reminders/:reminderId/events')
  @ApiOperation({ summary: 'List immutable reminder history newest first' })
  @ApiOkResponse({ description: 'Stable cursor-paginated event history' })
  listEvents(
    @CurrentUser() principal: AuthPrincipal,
    @Param('reminderId', new ParseUUIDPipe()) reminderId: string,
    @Query() query: ListReminderEventsDto,
  ) {
    return this.actions.listEvents(principal.userId, reminderId, query.limit, query.cursor);
  }

  @Get('reminders/:reminderId/nudge-policy')
  @ApiOperation({ summary: 'Get the bounded follow-up nudge policy for the current schedule' })
  @ApiOkResponse({ description: 'Current schedule nudge policy; disabled when none exists' })
  getNudgePolicy(
    @CurrentUser() principal: AuthPrincipal,
    @Param('reminderId', new ParseUUIDPipe()) reminderId: string,
  ) {
    return this.actions.getNudgePolicy(principal.userId, reminderId);
  }

  @Patch('reminders/:reminderId/nudge-policy')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Enable, change, or disable the single bounded follow-up nudge' })
  @ApiOkResponse({ description: 'Updated nudge policy' })
  updateNudgePolicy(
    @CurrentUser() principal: AuthPrincipal,
    @Param('reminderId', new ParseUUIDPipe()) reminderId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: UpdateNudgePolicyDto,
  ) {
    return this.actions.updateNudgePolicy(principal, reminderId, idempotencyKey, dto);
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

  @Get('reminder-occurrences/:occurrenceId/explanation')
  @ApiOperation({ summary: 'Return the deterministic Why now explanation for one occurrence' })
  @ApiOkResponse({ description: 'Schedule-derived explanation with nudge context' })
  explainOccurrence(
    @CurrentUser() principal: AuthPrincipal,
    @Param('occurrenceId', new ParseUUIDPipe()) occurrenceId: string,
  ) {
    return this.actions.explainOccurrence(principal.userId, occurrenceId);
  }

  @Post('reminder-occurrences/:occurrenceId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Complete a due or overdue occurrence exactly once' })
  @ApiOkResponse({ description: 'Authoritative terminal occurrence state' })
  @ApiConflictResponse({ description: 'Occurrence is early, stale, or already terminal' })
  complete(
    @CurrentUser() principal: AuthPrincipal,
    @Param('occurrenceId', new ParseUUIDPipe()) occurrenceId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: OccurrenceActionDto,
  ) {
    return this.actions.complete(principal, occurrenceId, idempotencyKey, dto);
  }

  @Post('reminder-occurrences/:occurrenceId/skip')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Skip one recurring occurrence exactly once' })
  @ApiOkResponse({ description: 'Authoritative terminal occurrence state' })
  @ApiConflictResponse({ description: 'Occurrence is one-time, stale, or already terminal' })
  skip(
    @CurrentUser() principal: AuthPrincipal,
    @Param('occurrenceId', new ParseUUIDPipe()) occurrenceId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: OccurrenceActionDto,
  ) {
    return this.actions.skip(principal, occurrenceId, idempotencyKey, dto);
  }
}
