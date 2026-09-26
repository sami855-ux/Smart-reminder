import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ReminderParserService } from './reminder-parser.service.js';
import { ReminderScheduleService } from './reminder-schedule.service.js';
import { ReminderTimeService } from './reminder-time.service.js';
import { RemindersController } from './reminders.controller.js';
import { RemindersService } from './reminders.service.js';

@Module({
  imports: [AuthModule],
  controllers: [RemindersController],
  providers: [
    ReminderScheduleService,
    ReminderParserService,
    ReminderTimeService,
    RemindersService,
  ],
  exports: [ReminderScheduleService],
})
export class RemindersModule {}
