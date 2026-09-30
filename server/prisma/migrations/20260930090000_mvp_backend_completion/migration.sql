-- Complete the MVP backend resources for lifecycle actions, device reconciliation,
-- notification preferences, bounded nudges, and local notification outcomes.

ALTER TYPE "ReminderActorType" ADD VALUE 'DEVICE';
ALTER TYPE "ReminderEventType" ADD VALUE 'REMINDER_UPDATED';
ALTER TYPE "ReminderEventType" ADD VALUE 'REMINDER_CANCELLED';
ALTER TYPE "ReminderEventType" ADD VALUE 'REMINDER_DELETED';
ALTER TYPE "ReminderEventType" ADD VALUE 'OCCURRENCE_COMPLETED';
ALTER TYPE "ReminderEventType" ADD VALUE 'OCCURRENCE_SKIPPED';
ALTER TYPE "ReminderEventType" ADD VALUE 'NUDGE_POLICY_UPDATED';
ALTER TYPE "ReminderEventType" ADD VALUE 'NOTIFICATION_REQUESTED';
ALTER TYPE "ReminderEventType" ADD VALUE 'NOTIFICATION_SCHEDULED';
ALTER TYPE "ReminderEventType" ADD VALUE 'NOTIFICATION_SCHEDULING_FAILED';
ALTER TYPE "ReminderEventType" ADD VALUE 'NOTIFICATION_CANCELLED';
ALTER TYPE "ReminderEventType" ADD VALUE 'NOTIFICATION_OPENED';
ALTER TYPE "ReminderEventType" ADD VALUE 'NOTIFICATION_ACTED_ON';

CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS');
CREATE TYPE "NotificationPermissionState" AS ENUM ('UNKNOWN', 'GRANTED', 'DENIED', 'PROVISIONAL', 'EPHEMERAL');
CREATE TYPE "LockScreenPrivacy" AS ENUM ('FULL', 'TITLE_ONLY', 'PRIVATE');
CREATE TYPE "TimeFormat" AS ENUM ('H12', 'H24');

ALTER TABLE "reminders" ADD COLUMN "purge_after" TIMESTAMPTZ(3);
ALTER TABLE "users" ADD COLUMN "locale" VARCHAR(35) NOT NULL DEFAULT 'en';
ALTER TABLE "users" ADD COLUMN "timezone" VARCHAR(100) NOT NULL DEFAULT 'UTC';
ALTER TABLE "users" ADD COLUMN "time_format" "TimeFormat" NOT NULL DEFAULT 'H24';
ALTER TABLE "users" ADD COLUMN "profile_revision" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "nudge_policies" (
  "id" UUID NOT NULL,
  "reminder_id" UUID NOT NULL,
  "schedule_id" UUID NOT NULL,
  "schedule_revision" INTEGER NOT NULL,
  "effective_scheduled_at" TIMESTAMPTZ(3) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "interval_minutes" INTEGER,
  "invalidated_at" TIMESTAMPTZ(3),
  "invalidation_reason" VARCHAR(64),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "nudge_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "device_installations" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "platform" "DevicePlatform" NOT NULL,
  "app_version" VARCHAR(40) NOT NULL,
  "permission_state" "NotificationPermissionState" NOT NULL DEFAULT 'UNKNOWN',
  "locale" VARCHAR(35) NOT NULL,
  "timezone" VARCHAR(100) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "device_installations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_preferences" (
  "user_id" UUID NOT NULL,
  "quiet_hours_start" CHAR(5),
  "quiet_hours_end" CHAR(5),
  "timezone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
  "lock_screen_privacy" "LockScreenPrivacy" NOT NULL DEFAULT 'TITLE_ONLY',
  "globally_paused" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "notification_attempts" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "reminder_id" UUID NOT NULL,
  "occurrence_id" UUID NOT NULL,
  "device_installation_id" UUID NOT NULL,
  "schedule_revision" INTEGER NOT NULL,
  "nudge_step" INTEGER NOT NULL DEFAULT 0,
  "logical_key" VARCHAR(255) NOT NULL,
  "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locally_scheduled_at" TIMESTAMPTZ(3),
  "scheduling_failed_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "opened_at" TIMESTAMPTZ(3),
  "acted_on_at" TIMESTAMPTZ(3),
  "os_notification_id" VARCHAR(255),
  "error_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notification_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nudge_policies_schedule_id_key" ON "nudge_policies"("schedule_id");
CREATE INDEX "nudge_policies_reminder_id_schedule_revision_idx" ON "nudge_policies"("reminder_id", "schedule_revision");
CREATE INDEX "device_installations_user_id_revoked_at_last_seen_at_idx" ON "device_installations"("user_id", "revoked_at", "last_seen_at");
CREATE UNIQUE INDEX "notification_attempts_logical_key_key" ON "notification_attempts"("logical_key");
CREATE UNIQUE INDEX "notif_attempt_occ_device_rev_instant_step_key"
  ON "notification_attempts"("occurrence_id", "device_installation_id", "schedule_revision", "effective_scheduled_at", "nudge_step");
CREATE INDEX "notification_attempts_user_id_updated_at_idx" ON "notification_attempts"("user_id", "updated_at");
CREATE INDEX "notification_attempts_device_installation_id_cancelled_at_idx" ON "notification_attempts"("device_installation_id", "cancelled_at");
CREATE INDEX "reminders_lifecycle_purge_after_idx" ON "reminders"("lifecycle", "purge_after");

ALTER TABLE "nudge_policies" ADD CONSTRAINT "nudge_policies_reminder_id_fkey"
  FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nudge_policies" ADD CONSTRAINT "nudge_policies_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "device_installations" ADD CONSTRAINT "device_installations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_reminder_id_fkey"
  FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_occurrence_id_fkey"
  FOREIGN KEY ("occurrence_id") REFERENCES "reminder_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_device_installation_id_fkey"
  FOREIGN KEY ("device_installation_id") REFERENCES "device_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "nudge_policies" ADD CONSTRAINT "nudge_policies_interval_check"
  CHECK (("enabled" = false AND "interval_minutes" IS NULL) OR ("enabled" = true AND "interval_minutes" BETWEEN 5 AND 1440));
ALTER TABLE "nudge_policies" ADD CONSTRAINT "nudge_policies_revision_check" CHECK ("schedule_revision" > 0);
ALTER TABLE "device_installations" ADD CONSTRAINT "device_installations_revision_check" CHECK ("revision" > 0);
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_quiet_hours_pair_check"
  CHECK (("quiet_hours_start" IS NULL) = ("quiet_hours_end" IS NULL));
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_quiet_hours_start_check"
  CHECK ("quiet_hours_start" IS NULL OR "quiet_hours_start" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_quiet_hours_end_check"
  CHECK ("quiet_hours_end" IS NULL OR "quiet_hours_end" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_revision_check" CHECK ("revision" > 0);
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_schedule_revision_check" CHECK ("schedule_revision" > 0);
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_nudge_step_check" CHECK ("nudge_step" IN (0, 1));
ALTER TABLE "users" ADD CONSTRAINT "users_profile_revision_check" CHECK ("profile_revision" > 0);
