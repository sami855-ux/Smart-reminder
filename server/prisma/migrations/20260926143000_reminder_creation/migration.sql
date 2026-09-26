-- Authoritative reminder creation, schedule, first occurrence, event, and idempotency storage.
CREATE TYPE "ReminderLifecycle" AS ENUM ('ACTIVE', 'CANCELLED', 'ARCHIVED');
CREATE TYPE "ScheduleType" AS ENUM ('ONE_TIME', 'DAILY', 'WEEKLY', 'SELECTED_WEEKDAYS');
CREATE TYPE "OccurrenceLifecycle" AS ENUM ('SCHEDULED', 'COMPLETED', 'SKIPPED', 'CANCELLED');
CREATE TYPE "ReminderEventType" AS ENUM ('REMINDER_CREATED', 'SCHEDULE_REVISED', 'OCCURRENCE_RESCHEDULED', 'OCCURRENCE_SNOOZED');
CREATE TYPE "ReminderActorType" AS ENUM ('USER', 'SYSTEM');

CREATE TABLE "reminders" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "context_note" VARCHAR(2000),
  "lifecycle" "ReminderLifecycle" NOT NULL DEFAULT 'ACTIVE',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "schedules" (
  "id" UUID NOT NULL,
  "reminder_id" UUID NOT NULL,
  "type" "ScheduleType" NOT NULL,
  "local_start_date" CHAR(10) NOT NULL,
  "local_start_time" CHAR(5) NOT NULL,
  "timezone" VARCHAR(100) NOT NULL,
  "recurrence_weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "end_local_date" CHAR(10),
  "occurrence_count" INTEGER,
  "resolved_start_at" TIMESTAMPTZ(3) NOT NULL,
  "resolved_utc_offset_min" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "materialized_through" TIMESTAMPTZ(3) NOT NULL,
  "next_evaluation_at" TIMESTAMPTZ(3),
  "superseded_schedule_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reminder_occurrences" (
  "id" UUID NOT NULL,
  "reminder_id" UUID NOT NULL,
  "schedule_id" UUID NOT NULL,
  "schedule_revision" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "occurrence_key" VARCHAR(160) NOT NULL,
  "original_scheduled_at" TIMESTAMPTZ(3) NOT NULL,
  "effective_scheduled_at" TIMESTAMPTZ(3) NOT NULL,
  "local_date" CHAR(10) NOT NULL,
  "local_time" CHAR(5) NOT NULL,
  "lifecycle" "OccurrenceLifecycle" NOT NULL DEFAULT 'SCHEDULED',
  "completed_at" TIMESTAMPTZ(3),
  "skipped_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reminder_occurrences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reminder_events" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "reminder_id" UUID NOT NULL,
  "occurrence_id" UUID,
  "actor_type" "ReminderActorType" NOT NULL,
  "actor_id" UUID,
  "type" "ReminderEventType" NOT NULL,
  "metadata" JSONB,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "request_hash" CHAR(64),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reminder_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reminder_create_requests" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "reminder_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reminder_create_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reminders_user_id_lifecycle_created_at_idx" ON "reminders"("user_id", "lifecycle", "created_at");
CREATE UNIQUE INDEX "schedules_reminder_id_revision_key" ON "schedules"("reminder_id", "revision");
CREATE INDEX "schedules_reminder_id_next_evaluation_at_idx" ON "schedules"("reminder_id", "next_evaluation_at");
CREATE UNIQUE INDEX "reminder_occurrences_schedule_id_occurrence_key_key" ON "reminder_occurrences"("schedule_id", "occurrence_key");
CREATE UNIQUE INDEX "reminder_occurrences_schedule_id_sequence_key" ON "reminder_occurrences"("schedule_id", "sequence");
CREATE INDEX "reminder_occurrences_reminder_id_lifecycle_effective_scheduled_at_idx" ON "reminder_occurrences"("reminder_id", "lifecycle", "effective_scheduled_at");
CREATE UNIQUE INDEX "reminder_events_user_id_idempotency_key_key" ON "reminder_events"("user_id", "idempotency_key");
CREATE INDEX "reminder_events_reminder_id_created_at_idx" ON "reminder_events"("reminder_id", "created_at");
CREATE UNIQUE INDEX "reminder_create_requests_user_id_idempotency_key_key" ON "reminder_create_requests"("user_id", "idempotency_key");
CREATE INDEX "reminder_create_requests_reminder_id_idx" ON "reminder_create_requests"("reminder_id");

ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_reminder_id_fkey"
  FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_superseded_schedule_id_fkey"
  FOREIGN KEY ("superseded_schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reminder_occurrences" ADD CONSTRAINT "reminder_occurrences_reminder_id_fkey"
  FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder_occurrences" ADD CONSTRAINT "reminder_occurrences_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_reminder_id_fkey"
  FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_occurrence_id_fkey"
  FOREIGN KEY ("occurrence_id") REFERENCES "reminder_occurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reminder_create_requests" ADD CONSTRAINT "reminder_create_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder_create_requests" ADD CONSTRAINT "reminder_create_requests_reminder_id_fkey"
  FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "schedules" ADD CONSTRAINT "schedules_selected_weekdays_check"
  CHECK (
    ("type" = 'SELECTED_WEEKDAYS' AND cardinality("recurrence_weekdays") BETWEEN 1 AND 7)
    OR ("type" <> 'SELECTED_WEEKDAYS' AND cardinality("recurrence_weekdays") = 0)
  );
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_weekday_values_check"
  CHECK ("recurrence_weekdays" <@ ARRAY[0,1,2,3,4,5,6]::INTEGER[]);
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_end_or_count_check"
  CHECK ("end_local_date" IS NULL OR "occurrence_count" IS NULL);
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_one_time_bounds_check"
  CHECK (
    "type" <> 'ONE_TIME'
    OR ("end_local_date" IS NULL AND "occurrence_count" IS NULL)
  );
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_end_after_start_check"
  CHECK ("end_local_date" IS NULL OR "end_local_date" >= "local_start_date");
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_occurrence_count_check"
  CHECK ("occurrence_count" IS NULL OR "occurrence_count" BETWEEN 1 AND 500);
ALTER TABLE "reminder_occurrences" ADD CONSTRAINT "reminder_occurrences_sequence_check"
  CHECK ("sequence" > 0);
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_title_not_blank_check"
  CHECK (char_length(btrim("title")) BETWEEN 1 AND 120);
