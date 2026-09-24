import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

const PURGE_INTERVAL_MS = 60 * 60 * 1_000;

@Injectable()
export class AccountPurgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountPurgeService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.purgeDueAccounts();
    this.timer = setInterval(() => void this.purgeDueAccounts(), PURGE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async purgeDueAccounts(now = new Date()): Promise<number> {
    try {
      const result = await this.prisma.user.deleteMany({
        where: {
          status: 'DELETION_PENDING',
          purgeAfter: { lte: now },
        },
      });
      if (result.count > 0) this.logger.log(`Purged ${result.count} expired account(s).`);
      return result.count;
    } catch (error) {
      this.logger.error('Account purge pass failed.', error instanceof Error ? error.stack : undefined);
      return 0;
    }
  }
}
