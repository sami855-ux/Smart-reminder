import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ReminderParserService } from './reminder-parser.service.js';
import { ReminderScheduleService } from './reminder-schedule.service.js';
import { ReminderTimeService } from './reminder-time.service.js';
import { RemindersController } from './reminders.controller.js';
import { RemindersService } from './reminders.service.js';
import { ReminderActionsService } from './reminder-actions.service.js';
import { ReminderPurgeService } from './reminder-purge.service.js';

@Module({
  imports: [AuthModule],
  controllers: [RemindersController],
  providers: [
    ReminderScheduleService,
    ReminderParserService,
    ReminderTimeService,
    RemindersService,
    ReminderActionsService,
    ReminderPurgeService,
  ],
  exports: [ReminderScheduleService],
})
export class RemindersModule {}
