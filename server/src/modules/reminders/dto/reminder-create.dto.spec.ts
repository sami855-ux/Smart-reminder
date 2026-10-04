import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReminderDto } from './reminder-create.dto.js';

describe('CreateReminderDto', () => {
  it('counts Unicode code points rather than UTF-16 code units', async () => {
    const dto = plainToInstance(CreateReminderDto, {
      title: '🔔'.repeat(120),
      confirmed: true,
      confirmedResolvedAt: '2026-09-27T06:00:00.000Z',
      schedule: {
        type: 'ONE_TIME',
        localDate: '2026-09-27',
        localTime: '09:00',
        timezone: 'Africa/Addis_Ababa',
      },
    });

    expect(await validate(dto)).toEqual([]);
  });

  it('rejects unconfirmed parser or manual output', async () => {
    const dto = plainToInstance(CreateReminderDto, {
      title: 'Call John',
      confirmed: false,
      confirmedResolvedAt: '2026-09-27T06:00:00.000Z',
      schedule: {
        type: 'ONE_TIME',
        localDate: '2026-09-27',
        localTime: '09:00',
        timezone: 'Africa/Addis_Ababa',
      },
    });

    expect((await validate(dto)).map((error) => error.property)).toContain('confirmed');
  });

  it('rejects a context note over 2,000 Unicode characters', async () => {
    const dto = plainToInstance(CreateReminderDto, {
      title: 'Call John',
      contextNote: 'a'.repeat(2001),
      confirmed: true,
      confirmedResolvedAt: '2026-09-27T06:00:00.000Z',
      schedule: {
        type: 'ONE_TIME',
        localDate: '2026-09-27',
        localTime: '09:00',
        timezone: 'Africa/Addis_Ababa',
      },
    });

    expect((await validate(dto)).map((error) => error.property)).toContain('contextNote');
  });

  it('requires the confirmed instant to include an RFC 3339 offset', async () => {
    const dto = plainToInstance(CreateReminderDto, {
      title: 'Call John',
      confirmed: true,
      confirmedResolvedAt: '2026-09-27',
      schedule: {
        type: 'ONE_TIME',
        localDate: '2026-09-27',
        localTime: '09:00',
        timezone: 'Africa/Addis_Ababa',
      },
    });

    expect((await validate(dto)).map((error) => error.property)).toContain(
      'confirmedResolvedAt',
    );
  });

  it('accepts location and exact Wi-Fi triggers during reminder creation', async () => {
    const dto = plainToInstance(CreateReminderDto, {
      title: 'Bring documents',
      confirmed: true,
      confirmedResolvedAt: '2026-09-27T06:00:00.000Z',
      schedule: {
        type: 'ONE_TIME',
        localDate: '2026-09-27',
        localTime: '09:00',
        timezone: 'Africa/Addis_Ababa',
      },
      contextTriggers: [
        {
          type: 'LOCATION_ARRIVE',
          label: 'Office',
          latitude: 9.03,
          longitude: 38.74,
          radiusMeters: 150,
        },
        {
          type: 'WIFI_CONNECT',
          label: 'Office network',
          networkName: ' Private Office Wi-Fi ',
        },
      ],
    });

    expect(await validate(dto)).toEqual([]);
    expect(dto.contextTriggers?.[1]?.networkName).toBe(' Private Office Wi-Fi ');
  });

  it('limits initial context triggers to ten', async () => {
    const dto = plainToInstance(CreateReminderDto, {
      title: 'Bring documents',
      confirmed: true,
      confirmedResolvedAt: '2026-09-27T06:00:00.000Z',
      schedule: {
        type: 'ONE_TIME',
        localDate: '2026-09-27',
        localTime: '09:00',
        timezone: 'Africa/Addis_Ababa',
      },
      contextTriggers: Array.from({ length: 11 }, (_, index) => ({
        type: 'WIFI_CONNECT',
        label: `Network ${index + 1}`,
        networkName: `SSID-${index + 1}`,
      })),
    });

    expect((await validate(dto)).map((error) => error.property)).toContain('contextTriggers');
  });
});
