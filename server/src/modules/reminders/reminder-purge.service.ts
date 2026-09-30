import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

const PURGE_INTERVAL_MS = 60 * 60_000;

@Injectable()
export class ReminderPurgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderPurgeService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.purgeDueReminders();
    this.timer = setInterval(() => void this.purgeDueReminders(), PURGE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async purgeDueReminders(now = new Date()): Promise<number> {
    try {
      const result = await this.prisma.reminder.deleteMany({
        where: { lifecycle: 'CANCELLED', purgeAfter: { lte: now } },
      });
      if (result.count > 0) this.logger.log(`Purged ${result.count} expired reminder(s).`);
      return result.count;
    } catch (error) {
      this.logger.error(
        'Reminder purge pass failed.',
        error instanceof Error ? error.stack : undefined,
      );
      return 0;
    }
  }
}
