import { ReminderParserService } from './reminder-parser.service.js';
import { ReminderScheduleService } from './reminder-schedule.service.js';
import { TimeFormatDto } from './dto/parse-reminder.dto.js';

describe('ReminderParserService conformance', () => {
  const parser = new ReminderParserService(new ReminderScheduleService());
  const base = {
    referenceInstant: '2026-09-26T07:00:00.000Z',
    locale: 'en-US',
    timezone: 'Africa/Addis_Ababa',
    timeFormat: TimeFormatDto.TWENTY_FOUR_HOUR,
  } as const;

  it.each([
    {
      text: 'Remind me tomorrow at 09:00 to call John.',
      expected: { title: 'call John', localDate: '2026-09-27', localTime: '09:00', type: 'ONE_TIME' },
    },
    {
      text: 'Remind me on 2026-10-03 at 14:30 to submit the report.',
      expected: { title: 'submit the report', localDate: '2026-10-03', localTime: '14:30', type: 'ONE_TIME' },
    },
    {
      text: 'Remind me October 5, 2026 at 8:15 am to renew the license.',
      expected: { title: 'renew the license', localDate: '2026-10-05', localTime: '08:15', type: 'ONE_TIME' },
    },
    {
      text: 'Remind me next Monday at 9:30 am to review invoices.',
      expected: { title: 'review invoices', localDate: '2026-09-28', localTime: '09:30', type: 'ONE_TIME' },
    },
    {
      text: 'Remind me Monday at 16:00 to submit expenses.',
      expected: { title: 'submit expenses', localDate: '2026-09-28', localTime: '16:00', type: 'ONE_TIME' },
    },
    {
      text: 'Remind me today at 18:00 to close the books.',
      expected: { title: 'close the books', localDate: '2026-09-26', localTime: '18:00', type: 'ONE_TIME' },
    },
    {
      text: 'Remind me tomorrow at 9 to check the deployment.',
      expected: { title: 'check the deployment', localDate: '2026-09-27', localTime: '09:00', type: 'ONE_TIME' },
    },
    {
      text: 'Remind me in 30 minutes to stretch.',
      expected: { title: 'stretch', localDate: '2026-09-26', localTime: '10:30', type: 'ONE_TIME' },
    },
    {
      text: 'Remind me in 2 hours to join the call.',
      expected: { title: 'join the call', localDate: '2026-09-26', localTime: '12:00', type: 'ONE_TIME' },
    },
    {
      text: 'Remind me in 2 days to check the application.',
      expected: { title: 'check the application', localDate: '2026-09-28', localTime: '10:00', type: 'ONE_TIME' },
    },
    {
      text: 'Remind me every day at 18:00 to take vitamins.',
      expected: { title: 'take vitamins', localDate: '2026-09-26', localTime: '18:00', type: 'DAILY' },
    },
    {
      text: 'Remind me every week at 11:00 to plan the week.',
      expected: { title: 'plan the week', localDate: '2026-09-26', localTime: '11:00', type: 'WEEKLY' },
    },
    {
      text: 'Remind me every Monday, Wednesday and Friday at 17:00 to exercise.',
      expected: { title: 'exercise', localDate: '2026-09-28', localTime: '17:00', type: 'SELECTED_WEEKDAYS' },
    },
  ])('parses $text against a fixed reference contract', ({ text, expected }) => {
    const result = parser.parse({ ...base, text });

    expect(result.status).toBe('SUCCESS');
    expect(result.created).toBe(false);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.structured).toMatchObject({
      title: expected.title,
      localDate: expected.localDate,
      localTime: expected.localTime,
      timezone: base.timezone,
      recurrence: { type: expected.type },
    });
    expect(result.preview).not.toBeNull();
  });

  it('requires AM/PM selection for a bare time in 12-hour mode', () => {
    const result = parser.parse({
      ...base,
      timeFormat: TimeFormatDto.TWELVE_HOUR,
      text: 'Remind me tomorrow at 9 to call John.',
    });

    expect(result.status).toBe('NEEDS_CLARIFICATION');
    expect(result.structured).toMatchObject({ title: 'call John', localTime: null });
    expect(result.ambiguities).toContainEqual(
      expect.objectContaining({ code: 'TIME_MERIDIEM_REQUIRED' }),
    );
    expect(result.supportedAlternatives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'time-am', patch: { localTime: '09:00' } }),
        expect.objectContaining({ id: 'time-pm', patch: { localTime: '21:00' } }),
      ]),
    );
  });

  it('requires clarification when an exact time is missing', () => {
    const result = parser.parse({ ...base, text: 'Remind me tomorrow to call John.' });
    expect(result.status).toBe('NEEDS_CLARIFICATION');
    expect(result.ambiguities).toContainEqual(
      expect.objectContaining({ code: 'EXACT_TIME_REQUIRED' }),
    );
    expect(result.preview).toBeNull();
  });

  it('requires an exact time for a non-exact daypart', () => {
    const result = parser.parse({ ...base, text: 'Remind me tomorrow morning to call John.' });
    expect(result.status).toBe('NEEDS_CLARIFICATION');
    expect(result.ambiguities).toContainEqual(
      expect.objectContaining({ code: 'DAYPART_EXACT_TIME_REQUIRED' }),
    );
    expect(result.preview).toBeNull();
  });

  it('keeps unsupported clauses visible and creates nothing', () => {
    const text = 'Remind me tomorrow at 09:00 to buy milk when I arrive home via WhatsApp.';
    const result = parser.parse({ ...base, text });

    expect(result.draft).toEqual({
      originalText: text,
      preserved: true,
      manualFormAvailable: true,
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['LOCATION_TRIGGER_UNAVAILABLE', 'INTEGRATION_UNAVAILABLE']),
    );
    expect(result.created).toBe(false);
  });

  it('recognizes unsupported device triggers', () => {
    const result = parser.parse({
      ...base,
      text: 'Remind me tomorrow at 09:00 to sync files when my phone is charging.',
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'DEVICE_TRIGGER_UNAVAILABLE' }),
    );
  });

  it('preserves the draft and manual fallback if the parser implementation fails', () => {
    const failingParser = new ReminderParserService({
      localPartsAtInstant: () => {
        throw new Error('simulated parser dependency failure');
      },
    } as unknown as ReminderScheduleService);
    const result = failingParser.parse({ ...base, text: 'Remind me tomorrow at 09:00 to call John.' });

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.draft).toMatchObject({ preserved: true, manualFormAvailable: true });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'PARSER_UNAVAILABLE' }),
    );
  });
});
