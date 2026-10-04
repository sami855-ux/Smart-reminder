import type { PrismaService } from '../../database/prisma.service.js';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { ReminderChecklistService } from './reminder-checklist.service.js';

describe('ReminderChecklistService', () => {
  const principal: AuthPrincipal = {
    userId: '10000000-0000-4000-8000-000000000001',
    sessionId: '20000000-0000-4000-8000-000000000001',
  };
  const reminderId = '30000000-0000-4000-8000-000000000001';

  it('replaces the template and snapshots every scheduled occurrence', async () => {
    const tx = {
      reminder: {
        findFirst: vi.fn().mockResolvedValue({
          id: reminderId,
          lifecycle: 'ACTIVE',
          revision: 3,
          checklistTemplates: [],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      reminderChecklistItem: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({
          id: '40000000-0000-4000-8000-000000000001',
          text: 'Bring the signed form',
          position: 0,
        }),
      },
      reminderOccurrence: {
        findMany: vi.fn().mockResolvedValue([
          { id: '50000000-0000-4000-8000-000000000001' },
          { id: '50000000-0000-4000-8000-000000000002' },
        ]),
      },
      occurrenceChecklistItem: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      reminderEvent: {
        create: vi.fn().mockResolvedValue({ id: '60000000-0000-4000-8000-000000000001' }),
      },
    };
    const prisma = {
      reminderEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;

    const result = await new ReminderChecklistService(prisma).replace(
      principal,
      reminderId,
      'checklist-replace-1',
      { expectedReminderRevision: 3, items: [{ text: 'Bring the signed form' }] },
    );

    expect(result).toMatchObject({ reminderRevision: 4, items: [{ text: 'Bring the signed form' }] });
    expect(tx.occurrenceChecklistItem.upsert).toHaveBeenCalledTimes(2);
    expect(tx.reminderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'CHECKLIST_UPDATED' }) }),
    );
  });

  it('checks an owned occurrence item with optimistic item revision', async () => {
    const now = new Date('2026-10-04T10:00:00.000Z');
    const occurrenceId = '50000000-0000-4000-8000-000000000001';
    const itemId = '40000000-0000-4000-8000-000000000001';
    const tx = {
      occurrenceChecklistItem: {
        findFirst: vi.fn().mockResolvedValue({
          id: itemId,
          occurrenceId,
          sourceItemId: itemId,
          text: 'Bring the signed form',
          position: 0,
          checkedAt: null,
          revision: 1,
          occurrence: { reminderId, lifecycle: 'SCHEDULED' },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      reminderEvent: {
        create: vi.fn().mockResolvedValue({ id: '60000000-0000-4000-8000-000000000001' }),
      },
    };
    const prisma = {
      reminderEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;

    const result = await new ReminderChecklistService(prisma).toggle(
      principal,
      occurrenceId,
      itemId,
      'checklist-toggle-1',
      { expectedRevision: 1, checked: true },
      now,
    );

    expect(result).toMatchObject({ item: { id: itemId, checked: true, revision: 2 } });
    expect(tx.reminderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'CHECKLIST_ITEM_CHECKED' }) }),
    );
  });
});
