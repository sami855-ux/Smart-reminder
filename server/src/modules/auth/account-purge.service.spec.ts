import type { PrismaService } from '../../database/prisma.service.js';
import { AccountPurgeService } from './account-purge.service.js';

describe('AccountPurgeService', () => {
  it('purges only deletion-pending accounts whose retention deadline has passed', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const service = new AccountPurgeService({ user: { deleteMany } } as unknown as PrismaService);
    const now = new Date('2026-10-24T18:00:00.000Z');

    await expect(service.purgeDueAccounts(now)).resolves.toBe(2);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { status: 'DELETION_PENDING', purgeAfter: { lte: now } },
    });
  });
});
