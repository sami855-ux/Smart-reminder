import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ApiExceptionFilter } from '../src/common/errors/api-exception.filter.js';
import { requestIdMiddleware } from '../src/common/http/request-id.middleware.js';
import { PrismaService } from '../src/database/prisma.service.js';

const describeDatabase = process.env['RUN_DB_E2E'] === 'true' ? describe : describe.skip;

describeDatabase('Smart Reminder API with PostgreSQL', () => {
  let module: TestingModule;
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.use(requestIdMiddleware);
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
        stopAtFirstError: false,
      }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
  }, 30_000);

  afterAll(async () => {
    if (prisma && userId) {
      await prisma.authSecurityEvent.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await app?.close();
  }, 30_000);

  it('runs the authenticated reminder, device, preference, notification, and conflict workflow', async () => {
    const email = `e2e-${Date.now()}@example.test`;
    const registration = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'IntegrationPassword123!', deviceName: 'E2E' })
      .expect(201);
    expect(registration.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: { email },
    });
    accessToken = registration.body.accessToken as string;
    userId = registration.body.user.id as string;

    const profile = await request(app.getHttpServer())
      .get('/v1/me/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(profile.body).toMatchObject({ revision: 1, timezone: 'UTC', timeFormat: 'H24' });

    await request(app.getHttpServer())
      .patch('/v1/me/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        expectedRevision: 1,
        locale: 'en-ET',
        timezone: 'Africa/Addis_Ababa',
        timeFormat: 'H12',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ revision: 2, locale: 'en-ET', timeFormat: 'H12' });
      });

    const installationId = randomUUID();
    await request(app.getHttpServer())
      .put(`/v1/device-installations/${installationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        platform: 'ANDROID',
        appVersion: '1.0.0-e2e',
        permissionState: 'GRANTED',
        locale: 'en-ET',
        timezone: 'Africa/Addis_Ababa',
      })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ id: installationId, revision: 1 }));

    await request(app.getHttpServer())
      .patch('/v1/notification-preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        expectedRevision: 0,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        timezone: 'Africa/Addis_Ababa',
        lockScreenPrivacy: 'PRIVATE',
        globallyPaused: false,
      })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ revision: 1, lockScreenPrivacy: 'PRIVATE' }));

    const create = await request(app.getHttpServer())
      .post('/v1/reminders')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'e2e-create-reminder-1')
      .send({
        title: 'Database integration reminder',
        contextNote: 'E2E only',
        schedule: {
          type: 'ONE_TIME',
          localDate: '2099-01-01',
          localTime: '09:00',
          timezone: 'UTC',
        },
        confirmed: true,
        confirmedResolvedAt: '2099-01-01T09:00:00.000Z',
      })
      .expect(201);
    const reminderId = create.body.id as string;
    const occurrenceId = create.body.firstOccurrence.id as string;
    const originalEffectiveAt = create.body.firstOccurrence.effectiveScheduledAt as string;

    await request(app.getHttpServer())
      .post('/v1/notification-attempts')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'e2e-notification-request-1')
      .send({
        occurrenceId,
        deviceInstallationId: installationId,
        scheduleRevision: 1,
        effectiveScheduledAt: originalEffectiveAt,
        nudgeStep: 0,
        outcome: 'LOCALLY_SCHEDULED',
        osNotificationId: 'e2e-os-notification-1',
      })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ locallyScheduledAt: expect.any(String) }));

    const dueAt = new Date(Date.now() - 60_000);
    await prisma.reminderOccurrence.update({
      where: { id: occurrenceId },
      data: { effectiveScheduledAt: dueAt },
    });

    const completionBody = {
      expectedScheduleRevision: 1,
      expectedEffectiveScheduledAt: dueAt.toISOString(),
    };
    const completion = await request(app.getHttpServer())
      .post(`/v1/reminder-occurrences/${occurrenceId}/complete`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'e2e-complete-reminder-1')
      .send(completionBody)
      .expect(200);
    expect(completion.body).toMatchObject({
      lifecycle: 'COMPLETED',
      reminderLifecycle: 'ARCHIVED',
      idempotency: { replayed: false },
    });

    await request(app.getHttpServer())
      .post(`/v1/reminder-occurrences/${occurrenceId}/complete`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'e2e-complete-reminder-1')
      .send(completionBody)
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ idempotency: { replayed: true } }));

    await request(app.getHttpServer())
      .post(`/v1/reminder-occurrences/${occurrenceId}/complete`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'e2e-complete-reminder-2')
      .send(completionBody)
      .expect(409)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          version: 1,
          code: 'OCCURRENCE_STATE_CONFLICT',
          details: { occurrenceId, lifecycle: 'COMPLETED' },
        });
      });

    const history = await request(app.getHttpServer())
      .get(`/v1/reminders/${reminderId}/events`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(history.body.items.map((item: { type: string }) => item.type)).toEqual(
      expect.arrayContaining(['REMINDER_CREATED', 'NOTIFICATION_SCHEDULED', 'OCCURRENCE_COMPLETED']),
    );

    const completed = await request(app.getHttpServer())
      .get('/v1/reminder-occurrences')
      .query({ view: 'COMPLETED', from: '2000-01-01T00:00:00.000Z', limit: 10 })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(completed.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: occurrenceId, lifecycle: 'COMPLETED' })]),
    );

    const exported = await request(app.getHttpServer())
      .get('/v1/auth/export')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(exported.body).toMatchObject({
      format: 'smart-reminder-export',
      version: 1,
      account: { id: userId, locale: 'en-ET' },
    });
    expect(exported.body.reminders).toHaveLength(1);
  }, 30_000);
});
