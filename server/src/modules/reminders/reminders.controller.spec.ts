import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import type { ReminderActionsService } from './reminder-actions.service.js';
import { RemindersController } from './reminders.controller.js';
import type { ReminderParserService } from './reminder-parser.service.js';
import type { RemindersService } from './reminders.service.js';
import type { ReminderTimeService } from './reminder-time.service.js';

describe('RemindersController create response preference', () => {
  const principal: AuthPrincipal = {
    userId: '10000000-0000-4000-8000-000000000001',
    sessionId: '20000000-0000-4000-8000-000000000001',
  };
  const created = {
    id: '30000000-0000-4000-8000-000000000001',
    occurrences: [{ id: '50000000-0000-4000-8000-000000000001' }],
  };

  function controller() {
    const reminders = {
      create: vi.fn().mockResolvedValue(created),
    } as unknown as RemindersService;
    return new RemindersController(
      reminders,
      {} as ReminderParserService,
      {} as ReminderTimeService,
      {} as ReminderActionsService,
    );
  }

  it('includes occurrences when the client requests the full representation', async () => {
    const result = await controller().create(
      principal,
      'create-reminder-0001',
      'return=representation',
      {} as never,
    );

    expect(result.occurrences).toEqual(created.occurrences);
  });

  it('omits occurrences for older strict clients', async () => {
    const result = await controller().create(
      principal,
      'create-reminder-0001',
      undefined,
      {} as never,
    );
    const serialized = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;

    expect(serialized).not.toHaveProperty('occurrences');
  });
});
