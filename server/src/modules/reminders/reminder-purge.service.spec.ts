import type { PrismaService } from '../../database/prisma.service.js';
import { ReminderPurgeService } from './reminder-purge.service.js';

describe('ReminderPurgeService', () => {
  it('purges only cancelled reminders whose retention window expired', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const service = new ReminderPurgeService({ reminder: { deleteMany } } as unknown as PrismaService);
    const now = new Date('2026-10-30T09:00:00.000Z');

    await expect(service.purgeDueReminders(now)).resolves.toBe(2);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { lifecycle: 'CANCELLED', purgeAfter: { lte: now } },
    });
  });
});
